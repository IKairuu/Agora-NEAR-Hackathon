jest.mock('../prisma', () => ({ prisma: {} }));

import { AgentsService } from '../agents/agents.service';
import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { ReviewsRepository } from './reviews.repository';
import { REVIEW_TIMEOUT_MS, ReviewsService, rerunWhy, toEvidence, toPanel } from './reviews.service';

const BUYER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const DELIVERY = '7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f';
const NOW = new Date('2026-11-09T12:00:00Z').getTime();
const AGENTS = [
    { id: 'r1', label: 'reviewer-1', model: 'Qwen3-Coder 480B' },
    { id: 'r2', label: 'reviewer-2', model: 'GLM-4.6' },
    { id: 'r3', label: 'reviewer-3', model: 'DeepSeek-V3.1' },
];
const vote = (agent: string, approve: boolean) => ({
    reviewerAgentId: agent, approve, checkResults: { testsPass: approve }, logHash: 'e3a1b2c3d4e5f6a7b8c9', logPath: '/logs/x',
    attestationHash: 'tdx:9f2c00000000e41b', model: null, voteTx: 'mock-vote-1', createdAt: new Date(NOW), reviewerAgent: { label: agent },
});
const run = (over: object = {}) => ({
    runId: 'run-1', round: 1, status: 'done', exitCode: 0, installExit: 0, baselineExitCode: 101, scopeOk: true, changedFiles: ['src/split.rs'],
    logHash: 'abc', logPath: '/logs/run-1', durationMs: 900, error: null, startedAt: new Date(NOW - 60_000), finishedAt: new Date(NOW), ...over,
});
const panel = (over: object = {}) => ({
    id: DELIVERY, attempt: 1, commitSha: '81b0973aa1c2', status: 'reviewing', verdict: 'pass', reason: null, createdAt: new Date(NOW - 60_000),
    votes: [] as ReturnType<typeof vote>[], reviewRuns: [run()], ...over,
});
const explorer = (tx: string) => `https://testnet.nearblocks.io/txns/${tx}`;

describe('reviews helpers', () => {
    it('fills the three reviewer slots in label order', () => {
        const p = toPanel(panel({ votes: [vote('r1', true), vote('r3', false)] }) as never, AGENTS, explorer, NOW);
        expect(p.votes).toEqual([2, 1, 3]);
        expect(p.reviewers.map((r) => r.id)).toEqual(['A', 'B', 'C']);
        expect(p.reviewers[0]).toMatchObject({ model: 'Qwen3-Coder 480B', approve: true, att: 'tdx:9f2c…e41b', log: 'e3a1b2c3…b8c9', explorer: 'https://testnet.nearblocks.io/txns/mock-vote-1' });
        expect(p).toMatchObject({ approvals: 1, rejections: 1, canRerun: true, rerunWhy: 'split_vote', commit: '81b0973' });
    });

    it('shows queued slots before anything is delivered', () => {
        expect(toPanel(null, AGENTS, explorer, NOW)).toMatchObject({ deliveryId: null, votes: [0, 0, 0], canRerun: false });
    });

    it('allows a rerun only for a failed run, a split vote or a timeout', () => {
        const d = { status: 'reviewing', createdAt: new Date(NOW - 60_000), votes: [] as { approve: boolean }[] };
        expect(rerunWhy(d, run({ status: 'running' }), NOW)).toBeNull();
        expect(rerunWhy(d, run({ status: 'running', startedAt: new Date(NOW - 20 * 60_000) }), NOW)).toBe('runner_failed');
        expect(rerunWhy(d, run({ status: 'failed' }), NOW)).toBe('runner_failed');
        expect(rerunWhy(d, run(), NOW)).toBeNull();
        expect(rerunWhy({ ...d, votes: [{ approve: true }, { approve: false }] }, run(), NOW)).toBe('split_vote');
        expect(rerunWhy({ ...d, createdAt: new Date(NOW - REVIEW_TIMEOUT_MS) }, run(), NOW)).toBe('timeout');
        expect(rerunWhy({ ...d, status: 'approved' }, run({ status: 'failed' }), NOW)).toBeNull();
    });

    it('builds an evidence bundle with file hashes and a bundle hash', () => {
        const job = {
            id: 'j', ref: 'J-1042', title: 'Split fix', status: 'reviewed', repoUrl: 'https://github.com/x/y', baseCommit: '8e35f67', agreedPrice: 32,
            buyer: { displayName: 'Lumen', nearAccountId: 'lumen.testnet' }, seller: { displayName: 'patchsmith', nearAccountId: 'patchsmith.testnet' },
            acceptanceSpecs: [{ version: 1, specHash: 'h', holdoutHash: null, lockedAt: new Date(NOW), lockTx: null, testCommand: 'cargo test --no-fail-fast', buildCommand: null, failingTests: ['test_split_rounding'], allowedPaths: ['src/split.rs'], testFiles: [{ path: 'tests/split_rounding.rs', content: 'abc' }], checks: [{ position: 0, name: 'Rounding', howVerified: 'test', weight: 'required' }] }],
            milestones: [{ idx: 0, amount: 32, status: 'in_review', fundedTx: 'mock-fund_job-1', releasedTx: null, deliveries: [{ attempt: 1, commitSha: '81b0973', repoUrl: 'https://github.com/x/y', status: 'approved', verdict: 'pass', reason: null, filesTouched: ['src/split.rs'], diffStats: null, submitTx: 'mock-submit_delivery-1', createdAt: new Date(NOW), reviewRuns: [run()], votes: [vote('r1', true)] }] }],
            chainTxs: [],
        };
        const a = toEvidence(job as never, new Date(NOW));
        expect(a.spec?.testFiles).toEqual([{ path: 'tests/split_rounding.rs', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }]);
        expect(a.milestones[0]?.deliveries[0]).toMatchObject({ attempt: 1, votes: [expect.objectContaining({ reviewer: 'r1', approve: true })] });
        expect(a.bundleSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(toEvidence(job as never, new Date(NOW)).bundleSha256).toBe(a.bundleSha256);
    });
});

describe('ReviewsService', () => {
    let repo: jest.Mocked<ReviewsRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: ReviewsService;
    let fetchMock: jest.Mock;
    const env = { ...process.env };

    const target = (over: object = {}) => ({
        id: DELIVERY, status: 'reviewing', commitSha: '81b0973aa1c2', repoUrl: 'https://github.com/x/y', createdAt: new Date(Date.now() - 60_000),
        votes: [] as { approve: boolean }[], reviewRuns: [{ round: 1, status: 'failed', startedAt: new Date(Date.now() - 60_000) }],
        milestone: { job: { id: 'j', ref: 'J-1042', onchainId: null, baseCommit: '8e35f67', buyerId: BUYER, seller: { ownerId: 'seller' }, acceptanceSpecs: [{ testCommand: 'cargo test --no-fail-fast', buildCommand: null, failingTests: [], allowedPaths: ['src/split.rs'], testFiles: [] }] } },
        ...over,
    });

    beforeEach(() => {
        repo = {
            getReviewers: jest.fn().mockResolvedValue(AGENTS), isParty: jest.fn().mockResolvedValue(true), getLatestDelivery: jest.fn(), getEvidence: jest.fn(),
            getRerunTarget: jest.fn(), createRerun: jest.fn().mockResolvedValue({ id: 'rr2', round: 2 }), setRunStatus: jest.fn(),
        } as unknown as jest.Mocked<ReviewsRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-rerun_review-1', explorer_url: '', result: null }),
            explorerTxUrl: jest.fn(explorer),
        } as unknown as jest.Mocked<ChainService>;
        const agents = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }), dispatchReviewers: jest.fn().mockResolvedValue([{ status: 'sent' }, { status: 'sent' }, { status: 'sent' }]) } as unknown as AgentsService;
        service = new ReviewsService(repo, { verifySessionToken: jest.fn().mockResolvedValue(BUYER) } as unknown as AuthService, chain, agents);
        fetchMock = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = fetchMock as unknown as typeof fetch;
        process.env['AGORA_RUNNER_URL'] = 'http://runner:4100';
        process.env['AGORA_RUNNER_KEY'] = 'runner-key';
    });

    afterEach(() => { process.env = { ...env }; });

    it('hides the panel from people outside the job', async () => {
        repo.isParty.mockResolvedValue(false);
        await expect(service.getReviews('Bearer t', 'J-1042')).rejects.toThrow('Job not found');
    });

    it('reruns the tests after a failed run without a chain call', async () => {
        repo.getRerunTarget.mockResolvedValue(target() as never);
        await expect(service.rerunReview('Bearer t', { delivery_id: DELIVERY } as never)).resolves.toMatchObject({
            message: 'Review Successfully Rerun', round: 2, runner: 'queued', why: 'runner_failed', rerunTx: null,
        });
        expect(chain.callAs.mock.calls).toHaveLength(0);
        expect(repo.createRerun.mock.calls[0]?.[0]).toMatchObject({ deliveryId: DELIVERY, round: 2, userIds: [BUYER, 'seller'], ref: 'J-1042' });
        expect(JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)).toMatchObject({ commit: '81b0973aa1c2', deliveryId: DELIVERY });
    });

    it('calls rerun_review on chain after a split vote', async () => {
        repo.getRerunTarget.mockResolvedValue(target({ votes: [{ approve: true }, { approve: false }], reviewRuns: [{ round: 1, status: 'done', startedAt: new Date() }] }) as never);
        await expect(service.rerunReview('Bearer t', { delivery_id: DELIVERY, reason: 'Reviewer 3 is down' } as never)).resolves.toMatchObject({ why: 'split_vote', rerunTx: 'mock-rerun_review-1' });
        expect(chain.callAs.mock.calls[0]).toEqual(['platform', 'agora-testnet.testnet', 'rerun_review', { job_id: 'J-1042' }]);
        expect(repo.createRerun.mock.calls[0]?.[0].reason).toContain('Note: Reviewer 3 is down');
    });

    it.each([
        [{ status: 'approved' }, 'already decided'],
        [{ reviewRuns: [{ round: 1, status: 'running', startedAt: new Date() }] }, 'still running'],
        [{ reviewRuns: [{ round: 1, status: 'done', startedAt: new Date() }] }, 'A rerun is allowed after'],
        [{ reviewRuns: [{ round: 5, status: 'failed', startedAt: new Date() }] }, 'No more than 5'],
    ])('refuses a rerun it should not start %#', async (over, msg) => {
        repo.getRerunTarget.mockResolvedValue(target(over) as never);
        await expect(service.rerunReview('Bearer t', { delivery_id: DELIVERY } as never)).rejects.toThrow(msg);
        expect(repo.createRerun.mock.calls).toHaveLength(0);
    });

    it('refuses unknown deliveries and jobs', async () => {
        repo.getRerunTarget.mockResolvedValue(null);
        await expect(service.rerunReview('Bearer t', { delivery_id: DELIVERY } as never)).rejects.toThrow('Delivery not found');
        repo.getEvidence.mockResolvedValue(null);
        await expect(service.getEvidence('Bearer t', 'J-1042')).rejects.toThrow('Job not found');
        await expect(service.getEvidence('Bearer t', 'nope')).rejects.toThrow('Job id is not valid');
    });
});
