jest.mock('../prisma', () => ({ prisma: {} }));

import { AgentsService } from '../agents/agents.service';
import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { Prisma } from '../generated/prisma/client';
import { ESCALATION_WINDOW_MS } from '../indexer/indexer.service';
import { DisputesRepository } from './disputes.repository';
import { DisputesService, toDisputeView } from './disputes.service';

const BUYER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SELLER = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const DISPUTE = '7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f';
const NOW = new Date('2026-11-09T12:00:00Z').getTime();
const D = (n: number) => new Prisma.Decimal(n);

const dispute = (over: object = {}) => ({
    id: DISPUTE, status: 'recheck', reason: 'The tests were wrong', openedBy: BUYER, openedAt: new Date(NOW - 7_200_000),
    recheckOutcome: null, recheckAt: null, escalatedBy: null, escalatorAccount: null, escalatedAt: null, claim: null, bondAmount: null, bondTx: null,
    daoProposalId: null, ruling: null, sellerAmount: null, buyerAmount: null, sellerShareBps: null, resolvedBy: null, resolveTx: null, resolvedAt: null, bondReturned: null,
    ...over,
});
const job = (d: object | null = null, over: object = {}) => ({
    id: 'job-1', ref: 'J-1042', title: 'Split fix', onchainId: null, status: d ? 'disputed' : 'delivered', baseCommit: '8e35f67', agreedPrice: D(20), buyerId: BUYER,
    buyer: { displayName: 'Lumen', nearAccountId: 'lumen.testnet' },
    seller: { displayName: 'patchsmith', nearAccountId: 'patchsmith.testnet', ownerId: SELLER },
    acceptanceSpecs: [{ testCommand: 'cargo test --no-fail-fast', buildCommand: null, failingTests: [], allowedPaths: ['src/split.rs'], testFiles: [] }],
    milestones: [{
        id: 'm0', amount: D(20), disputes: d ? [d] : [],
        deliveries: [{ id: 'del-1', commitSha: '81b0973aa1c2', repoUrl: 'https://github.com/x/y', reviewRuns: [{ round: 1 }] }],
    }],
    ...over,
});

describe('toDisputeView', () => {
    it('shows no dispute yet and whether one can be opened', () => {
        expect(toDisputeView(job() as never, BUYER, NOW)).toMatchObject({ id: null, status: 'none', role: 'buyer', canOpen: true, bondNeeded: 1, canEscalate: false, canFinalize: false });
    });

    it('lets only the losing side escalate inside 72 hours', () => {
        const d = dispute({ recheckOutcome: 'release', recheckAt: new Date(NOW - 3_600_000) });
        expect(toDisputeView(job(d) as never, BUYER, NOW)).toMatchObject({ canEscalate: true, canFinalize: false, openedBy: 'buyer' });
        expect(toDisputeView(job(d) as never, SELLER, NOW)).toMatchObject({ role: 'seller', canEscalate: false });
        const late = NOW - 3_600_000 + ESCALATION_WINDOW_MS;
        expect(toDisputeView(job(d) as never, BUYER, late)).toMatchObject({ canEscalate: false, canFinalize: true });
    });

    it('counts the 72 hours from the escalation once escalated', () => {
        const d = dispute({ status: 'escalated', recheckOutcome: 'release', recheckAt: new Date(NOW - ESCALATION_WINDOW_MS), escalatedAt: new Date(NOW - 1000), escalatedBy: BUYER, claim: 'refund', bondAmount: D(1) });
        const v = toDisputeView(job(d) as never, SELLER, NOW);
        expect(v).toMatchObject({ canEscalate: false, canFinalize: false, escalation: { by: 'buyer', claim: 'refund', bond: 1 } });
        expect(toDisputeView(job(d) as never, SELLER, NOW - 1000 + ESCALATION_WINDOW_MS).canFinalize).toBe(true);
    });

    it('shows the resolution', () => {
        const d = dispute({ status: 'resolved', ruling: 'split', sellerAmount: D(13.72), buyerAmount: D(6), sellerShareBps: 7000, resolvedBy: 'dao', bondReturned: true });
        expect(toDisputeView(job(d) as never, BUYER, NOW)).toMatchObject({ canFinalize: false, resolution: { ruling: 'split', sellerAmount: 13.72, buyerAmount: 6, by: 'dao', bondReturned: true } });
    });
});

describe('DisputesService', () => {
    let repo: jest.Mocked<DisputesRepository>;
    let chain: jest.Mocked<ChainService>;
    let agents: jest.Mocked<AgentsService>;
    let auth: { verifySessionToken: jest.Mock };
    let service: DisputesService;
    let fetchMock: jest.Mock;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            getDisputeJob: jest.fn().mockResolvedValue(job()), getDisputeJobById: jest.fn().mockResolvedValue(job(dispute())),
            startRecheck: jest.fn().mockResolvedValue({ id: 'rr', round: 2 }), setRunStatus: jest.fn(), createNotes: jest.fn().mockResolvedValue(2),
            getBalance: jest.fn().mockResolvedValue({ available: D(12.5), escrowed: D(0), syncedAt: null }),
        } as unknown as jest.Mocked<DisputesRepository>;
        chain = {
            callAs: jest.fn(async (_r: string, _a: string, method: string) => ({ tx_hash: `mock-${method}-1`, explorer_url: 'x', result: null })),
            explorerTxUrl: jest.fn((t: string) => `https://testnet.nearblocks.io/txns/${t}`),
            explorerAccountUrl: jest.fn((a: string) => `https://testnet.nearblocks.io/address/${a}`),
        } as unknown as jest.Mocked<ChainService>;
        agents = { dispatchReviewers: jest.fn().mockResolvedValue([{ status: 'sent' }, { status: 'sent' }, { status: 'skipped' }]) } as unknown as jest.Mocked<AgentsService>;
        auth = { verifySessionToken: jest.fn().mockResolvedValue(BUYER) };
        service = new DisputesService(repo, auth as unknown as AuthService, chain, agents);
        service.now = () => NOW;
        fetchMock = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = fetchMock as unknown as typeof fetch;
        process.env['AGORA_RUNNER_URL'] = 'http://runner:4100';
        process.env['AGORA_RUNNER_KEY'] = 'runner-key';
        process.env['AGORA_CHAIN_MODE'] = 'mock';
    });

    afterEach(() => { process.env = { ...env }; });

    it('opens a dispute as the caller and starts the free re-check', async () => {
        repo.getDisputeJob.mockResolvedValueOnce(job() as never).mockResolvedValueOnce(job(dispute()) as never);
        const res = await service.createDispute('Bearer t', { job_id: 'J-1042', reason: '  The tests were wrong  ' } as never);
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'lumen.testnet', 'open_dispute', { job_id: 'J-1042', reason: 'The tests were wrong' }]);
        expect(repo.startRecheck.mock.calls[0]?.[0]).toMatchObject({ deliveryId: 'del-1', round: 2, userIds: [BUYER, SELLER], ref: 'J-1042' });
        expect(JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)).toMatchObject({ commit: '81b0973aa1c2', deliveryId: 'del-1' });
        expect(agents.dispatchReviewers.mock.calls[0]).toEqual([BUYER, 'job-1', 'del-1']);
        expect(res).toMatchObject({ message: 'Dispute Successfully Opened', id: DISPUTE, status: 'recheck', openTx: 'mock-open_dispute-1', round: 2, runner: 'queued', reviewers: 2 });
    });

    it('signs as the seller account when the seller opens it', async () => {
        auth.verifySessionToken.mockResolvedValue(SELLER);
        await service.createDispute('Bearer t', { job_id: 'J-1042', reason: 'Reviewer was wrong' } as never);
        expect(chain.callAs.mock.calls[0]?.[1]).toBe('patchsmith.testnet');
    });

    it('refuses a second dispute, an unknown job and a bad id', async () => {
        repo.getDisputeJob.mockResolvedValueOnce(job(dispute()) as never);
        await expect(service.createDispute('Bearer t', { job_id: 'J-1042', reason: 'x' } as never)).rejects.toThrow('This job already has a dispute');
        repo.getDisputeJob.mockResolvedValueOnce(null);
        await expect(service.createDispute('Bearer t', { job_id: 'J-1042', reason: 'x' } as never)).rejects.toThrow('Job not found');
        await expect(service.createDispute('Bearer t', { job_id: 'nope', reason: 'x' } as never)).rejects.toThrow('Job id is not valid');
        expect(chain.callAs.mock.calls).toHaveLength(0);
    });

    it('escalates with the minimum bond through ft_transfer_call', async () => {
        const res = await service.escalateDispute('Bearer t', DISPUTE, {} as never);
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'lumen.testnet', 'ft_transfer_call', { receiver_id: 'agora-market.agora-testnet.testnet', amount: '1000000', msg: 'dispute_bond:J-1042' }, '1']);
        expect(res).toMatchObject({ message: 'Dispute Successfully Escalated', claim: 'refund', bond: 1, bondTx: 'mock-ft_transfer_call-1' });
        expect(repo.createNotes.mock.calls[0]?.[0]).toHaveLength(2);
    });

    it('rules as the DAO in mock mode only', async () => {
        repo.getDisputeJobById.mockResolvedValueOnce(job(dispute({ status: 'escalated' })) as never)
            .mockResolvedValueOnce(job(dispute({ status: 'resolved', ruling: 'split', sellerAmount: D(13.72), buyerAmount: D(6), sellerShareBps: 7000, resolvedBy: 'dao' })) as never);
        const res = await service.ruleDispute('Bearer t', DISPUTE, { outcome: 'split', seller_share_bps: 7000 } as never);
        expect(chain.callAs.mock.calls[0]).toEqual(['dao', 'agora-dao.sputnikv2.testnet', 'resolve_dispute', { job_id: 'J-1042', outcome: 'split', seller_share_bps: 7000 }]);
        expect(res).toMatchObject({ message: 'Dispute Successfully Ruled', resolution: { ruling: 'split', sellerAmount: 13.72, buyerAmount: 6 } });
        await expect(service.ruleDispute('Bearer t', DISPUTE, { outcome: 'split' } as never)).rejects.toThrow('A split needs seller_share_bps');
        process.env['AGORA_CHAIN_MODE'] = 'near';
        await expect(service.ruleDispute('Bearer t', DISPUTE, { outcome: 'refund' } as never)).rejects.toThrow('mock chain only');
        expect(chain.callAs.mock.calls).toHaveLength(1);
    });

    it('finalizes as the platform and refuses disputes outside the caller jobs', async () => {
        await service.finalizeDispute('Bearer t', DISPUTE);
        expect(chain.callAs.mock.calls[0]).toEqual(['platform', 'agora-testnet.testnet', 'finalize_default', { job_id: 'J-1042' }]);
        repo.getDisputeJobById.mockResolvedValueOnce(null);
        await expect(service.finalizeDispute('Bearer t', DISPUTE)).rejects.toThrow('Dispute not found');
        await expect(service.escalateDispute('Bearer t', 'nope', {} as never)).rejects.toThrow('Dispute id is not valid');
    });

    it('shows the DAO treasury balance', async () => {
        await expect(service.getTreasury()).resolves.toMatchObject({ account: 'agora-dao.sputnikv2.testnet', balance: 12.5 });
    });
});
