jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { Prisma } from '../generated/prisma/client';
import { DeliveriesRepository } from './deliveries.repository';
import { DeliveriesService, resultLabel } from './deliveries.service';

const SELLER_USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const DELIVERY = '7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f';
const GOOD = '81b0973aa1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

const job = (over: object = {}) => ({
    id: JOB, ref: 'J-1042', title: 'Make test_split_rounding pass', status: 'funded', buyerId: 'buyer',
    repoUrl: 'https://github.com/lumen/payroll-vault', baseCommit: '8e35f67', onchainId: null,
    seller: { id: 'seller-1', ownerId: SELLER_USER, nearAccountId: 'patchsmith.testnet' },
    milestones: [{ id: 'm-0', status: 'funded', deliveries: [] }],
    acceptanceSpecs: [{ testCommand: 'cargo test --no-fail-fast', buildCommand: null, failingTests: ['test_split_rounding'], allowedPaths: ['src/split.rs'], testFiles: [{ path: 'tests/split_rounding.rs', content: 'x' }] }],
    ...over,
});

describe('DeliveriesService', () => {
    let repo: jest.Mocked<DeliveriesRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: DeliveriesService;
    let fetchMock: jest.Mock;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            getJobForDelivery: jest.fn().mockResolvedValue(job()), createDelivery: jest.fn().mockResolvedValue({ id: DELIVERY, attempt: 1 }),
            setRunStatus: jest.fn(), listDeliveries: jest.fn(), isParty: jest.fn(), getProof: jest.fn(),
        } as unknown as jest.Mocked<DeliveriesRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-submit_delivery-1', explorer_url: 'https://testnet.nearblocks.io/txns/mock-submit_delivery-1', result: null }),
            explorerTxUrl: jest.fn((tx: string) => `https://testnet.nearblocks.io/txns/${tx}`),
        } as unknown as jest.Mocked<ChainService>;
        const auth = { verifySessionToken: jest.fn().mockResolvedValue(SELLER_USER) } as unknown as AuthService;
        service = new DeliveriesService(repo, auth, chain);
        fetchMock = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = fetchMock as unknown as typeof fetch;
        process.env['AGORA_RUNNER_URL'] = 'http://runner:4100';
        process.env['AGORA_RUNNER_KEY'] = 'runner-key';
        process.env['AGORA_NEST_URL'] = 'http://api:3000/api';
    });

    afterEach(() => { process.env = { ...env }; });

    const body = { job_id: 'J-1042', commit_sha: GOOD } as never;

    it('submits on chain, saves the attempt and queues the locked tests', async () => {
        await expect(service.createDelivery('Bearer t', body)).resolves.toMatchObject({
            message: 'Delivery Successfully Submitted', id: DELIVERY, attempt: 1, attemptsLeft: 2, runner: 'queued', submitTx: 'mock-submit_delivery-1',
        });
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'patchsmith.testnet', 'submit_delivery', { job_id: 'J-1042', commit_hash: GOOD }]);
        expect(repo.createDelivery.mock.calls[0]?.[0]).toMatchObject({ milestoneId: 'm-0', sellerId: 'seller-1', attempt: 1, repoUrl: 'https://github.com/lumen/payroll-vault', buyerId: 'buyer' });
        const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
        expect(url).toBe('http://runner:4100/run');
        expect(init.headers['x-runner-key']).toBe('runner-key');
        expect(JSON.parse(init.body)).toMatchObject({
            commit: GOOD, baseCommit: '8e35f67', testCommand: 'cargo test --no-fail-fast', allowedPaths: ['src/split.rs'], deliveryId: DELIVERY,
            callbackUrl: 'http://api:3000/api/internal/v1/runner/result', testFiles: [{ path: 'tests/split_rounding.rs', content: 'x' }],
        });
        expect(repo.setRunStatus.mock.calls[0]?.slice(1)).toEqual(['running', null]);
    });

    it('keeps the delivery but marks the run failed when the runner is down', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        await expect(service.createDelivery('Bearer t', body)).resolves.toMatchObject({ runner: 'unavailable' });
        expect(repo.setRunStatus.mock.calls[0]?.slice(1)).toEqual(['failed', 'Runner unavailable']);
    });

    it.each([
        [{ seller: { id: 's', ownerId: 'someone-else', nearAccountId: 'x.testnet' } }, 'Only the hired seller'],
        [{ status: 'agreed' }, 'not protected the payment'],
        [{ status: 'delivered' }, 'Wait for the reviewers'],
        [{ status: 'settled' }, 'cannot take a delivery'],
        [{ milestones: [] }, 'Milestone 0 is not funded'],
        [{ milestones: [{ id: 'm-0', status: 'funded', deliveries: [{ attempt: 1, status: 'reviewing' }] }] }, 'Wait for the reviewers'],
        [{ milestones: [{ id: 'm-0', status: 'funded', deliveries: [{ attempt: 3, status: 'rejected' }] }] }, 'No attempts left'],
        [{ acceptanceSpecs: [] }, 'no locked spec'],
        [{ repoUrl: null }, 'repository URL'],
    ])('refuses a delivery it should not take %#', async (over, msg) => {
        repo.getJobForDelivery.mockResolvedValue(job(over) as never);
        await expect(service.createDelivery('Bearer t', body)).rejects.toThrow(msg);
        expect(chain.callAs.mock.calls).toHaveLength(0);
        expect(repo.createDelivery.mock.calls).toHaveLength(0);
    });

    it('counts the next attempt after a rejected one', async () => {
        repo.getJobForDelivery.mockResolvedValue(job({ status: 'in_progress', milestones: [{ id: 'm-0', status: 'funded', deliveries: [{ attempt: 1, status: 'rejected' }] }] }) as never);
        repo.createDelivery.mockResolvedValue({ id: DELIVERY, attempt: 2 });
        await expect(service.createDelivery('Bearer t', body)).resolves.toMatchObject({ attempt: 2, attemptsLeft: 1 });
        expect(repo.createDelivery.mock.calls[0]?.[0]).toMatchObject({ attempt: 2 });
    });

    it('turns a duplicate attempt into a conflict', async () => {
        repo.createDelivery.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));
        await expect(service.createDelivery('Bearer t', body)).rejects.toThrow('already delivered');
    });

    it('hides deliveries from people outside the job', async () => {
        repo.isParty.mockResolvedValue(false);
        await expect(service.getDeliveries('Bearer t', 'J-1042')).rejects.toThrow('Job not found');
    });

    it('labels each stage of a delivery', () => {
        const base = { status: 'submitted', verdict: null, reason: null, votes: [], reviewRuns: [{ status: 'running' }] } as never as Parameters<typeof resultLabel>[0];
        expect(resultLabel(base)).toBe('Tests running');
        expect(resultLabel({ ...base, reviewRuns: [{ status: 'failed' }] } as never)).toBe('Runner unavailable');
        expect(resultLabel({ ...base, status: 'reviewing', verdict: 'pass' } as never)).toBe('Tests pass, reviewers voting');
        expect(resultLabel({ ...base, status: 'reviewing', verdict: 'fail', reason: 'The locked tests fail' } as never)).toBe('Tests failed: The locked tests fail');
        expect(resultLabel({ ...base, status: 'rejected', votes: [{ approve: false }, { approve: false }] } as never)).toBe('rejected 0 of 3');
        expect(resultLabel({ ...base, status: 'approved', votes: [{ approve: true }, { approve: true }, { approve: false }] } as never)).toBe('approved 2 of 3');
    });

    it('refuses a malformed delivery id for proof', async () => {
        await expect(service.getProof('Bearer t', 'nope')).rejects.toThrow('valid id');
    });
});
