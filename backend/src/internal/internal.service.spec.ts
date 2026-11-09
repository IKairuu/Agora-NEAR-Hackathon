jest.mock('../prisma', () => ({ prisma: {} }));

import { ChainService } from '../chain/chain.service';
import { IndexerService } from '../indexer/indexer.service';
import { InternalRepository } from './internal.repository';
import { bidFlagsOf, decideBid, InternalService, judgeRun } from './internal.service';

const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const BID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('InternalService', () => {
    let repo: jest.Mocked<InternalRepository>;
    let service: InternalService;
    let indexer: jest.Mocked<IndexerService>;
    let chain: jest.Mocked<ChainService>;

    beforeEach(() => {
        repo = {
            getJob: jest.fn().mockResolvedValue({ id: JOB, ref: 'J-1042', title: 'Split fix', buyerId: 'buyer', seller: { ownerId: 'seller' } }),
            getBid: jest.fn(), getReviewRun: jest.fn(), saveRunResult: jest.fn().mockResolvedValue(1), getVoteTally: jest.fn(), settleDelivery: jest.fn().mockResolvedValue(1), recordRecheck: jest.fn().mockResolvedValue(1), setBidStatus: jest.fn().mockResolvedValue(1), createNotifications: jest.fn(async (n: unknown[]) => n.length),
        } as unknown as jest.Mocked<InternalRepository>;
        indexer = { onMockRelease: jest.fn().mockResolvedValue({ jobId: JOB, payout: 31.36, fee: 0.64 }) } as unknown as jest.Mocked<IndexerService>;
        chain = { callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-set_bid_flags-1', explorer_url: '', ok: true, result: null }) } as unknown as jest.Mocked<ChainService>;
        service = new InternalService(repo, indexer, chain);
    });

    const bid = (extra: object) => ({ id: BID, onchainId: null, status: 'pending_check', price: 36, priceCheck: 'cleared', fraudScore: 6, holdReason: null, job: { id: JOB, ref: 'J-1042', onchainId: null, buyerId: 'buyer' }, seller: { displayName: 'patchsmith', ownerId: 'seller' }, ...extra });

    it('makes a checked offer live and tells the buyer', async () => {
        repo.getBid.mockResolvedValue(bid({}) as never);
        const res = await service.agentNotify({ role: 'fraud_lure', ok: true, jobId: JOB, result: { subjectType: 'bid', subjectId: BID, score: 6 } });
        expect(repo.setBidStatus.mock.calls[0]).toEqual([BID, 'pending_check', 'live', null]);
        expect(repo.createNotifications.mock.calls[0]![0]).toEqual([expect.objectContaining({ userId: 'buyer', title: 'New offer on J-1042', body: 'patchsmith offered 36.00 USDC' })]);
        expect(res.actions).toEqual(['bid live', 'bid flags on chain', 'notified 1']);
        expect(chain.callAs.mock.calls[0]).toEqual(['fraud_oracle', 'oracle.agora-testnet.testnet', 'set_bid_flags', { job_id: 'J-1042', bid_id: BID, price_check_ok: true, fraud_score: 6, held: false }]);
    });

    it('flags with on-chain ids and keeps going when set_bid_flags fails', async () => {
        repo.getBid.mockResolvedValue(bid({ onchainId: 9n, priceCheck: 'held', job: { id: JOB, ref: 'J-1042', onchainId: 7n, buyerId: 'buyer' } }) as never);
        chain.callAs.mockRejectedValue(new Error('No signing key for oracle.agora-testnet.testnet'));
        const res = await service.agentNotify({ role: 'price_check', ok: true, jobId: JOB, result: { bidId: BID } });
        expect(chain.callAs.mock.calls[0]![3]).toEqual({ job_id: '7', bid_id: '9', price_check_ok: false, fraud_score: 6, held: true });
        expect(res.actions).toEqual(['bid held', 'bid flags not on chain', 'notified 2']);
    });

    it('does not flag a bid whose state did not change', async () => {
        repo.getBid.mockResolvedValue(bid({ status: 'live' }) as never);
        await service.agentNotify({ role: 'fraud_lure', ok: true, jobId: JOB, result: { subjectType: 'bid', subjectId: BID } });
        expect(chain.callAs.mock.calls).toHaveLength(0);
    });

    it('maps checks to contract flags', () => {
        expect(bidFlagsOf({ priceCheck: 'unverified', fraudScore: null })).toEqual({ price_check_ok: true, fraud_score: 0, held: false });
        expect(bidFlagsOf({ priceCheck: 'held', fraudScore: 140 })).toEqual({ price_check_ok: false, fraud_score: 100, held: true });
    });

    it('holds a lure and tells both sides', async () => {
        repo.getBid.mockResolvedValue(bid({ fraudScore: 91 }) as never);
        await service.agentNotify({ role: 'fraud_lure', ok: true, jobId: JOB, result: { subjectType: 'bid', subjectId: BID } });
        expect(repo.setBidStatus.mock.calls[0]).toEqual([BID, 'pending_check', 'held', 'High fraud and lure risk']);
        expect(repo.createNotifications.mock.calls[0]![0]).toHaveLength(2);
    });

    it('waits for both checks before going live', () => {
        expect(decideBid({ status: 'pending_check', priceCheck: null, fraudScore: 6, holdReason: null })).toBeNull();
        expect(decideBid({ status: 'pending_check', priceCheck: 'held', fraudScore: null, holdReason: 'Price far below reference' })).toEqual({ status: 'held', reason: 'Price far below reference' });
        expect(decideBid({ status: 'accepted', priceCheck: 'held', fraudScore: 99, holdReason: null })).toBeNull();
    });

    it('tells the buyer when a draft spec is ready', async () => {
        await service.agentNotify({ role: 'spec_writer', ok: true, jobId: JOB, result: { failsOnBase: true } });
        expect(repo.createNotifications.mock.calls[0]![0][0]).toMatchObject({ userId: 'buyer', title: 'Draft spec ready for J-1042' });
    });

    it('rejects a malformed body', async () => {
        await expect(service.agentNotify({ role: 'reviewer' })).rejects.toThrow('Invalid agent result');
    });

    const runResult = (over: object = {}) => ({
        runId: 'run-12345678', deliveryId: 'd1', error: null, exitCode: 0, installExit: 0, baselineExitCode: 101, changedFiles: ['src/split.rs'],
        scopeOk: true, diffStats: { files: 1, insertions: 3, deletions: 1 }, diffText: '', logTail: 'ok', logSha256: 'abc', logPath: '/logs/run-12345678',
        durationMs: 1200, timedOut: false, holdoutExit: null, failingTests: [], image: 'agora-runner-rust', steps: [], ...over,
    });

    it('judges runs with the same checks as the reviewers', () => {
        expect(judgeRun(runResult())).toEqual({ verdict: 'pass', reason: null });
        expect(judgeRun(runResult({ exitCode: 101 })).reason).toBe('The locked tests fail');
        expect(judgeRun(runResult({ scopeOk: false })).reason).toBe('Edits files outside the allowed paths');
        expect(judgeRun(runResult({ changedFiles: ['src/split.rs', 'tests/split_rounding.rs'] })).reason).toBe('Edits test files: tests/split_rounding.rs');
        expect(judgeRun(runResult({ error: 'bad_commit', exitCode: null })).reason).toBe('Commit not found or not built on the base commit');
        expect(judgeRun(runResult({ installExit: 101 })).reason).toBe('The build failed');
        expect(judgeRun(runResult({ changedFiles: [] })).reason).toBe('The commit changes no files');
    });

    it('saves a runner result and tells both sides', async () => {
        repo.getReviewRun.mockResolvedValue({ id: 'rr', status: 'running', delivery: { id: 'd1', attempt: 1, commitSha: 'abc', milestone: { job: { id: JOB, ref: 'J-1042', title: 'x', buyerId: 'buyer', seller: { ownerId: 'seller' } } } } } as never);
        await expect(service.runnerResult(runResult({ exitCode: 101 }))).resolves.toMatchObject({ verdict: 'fail', reason: 'The locked tests fail' });
        expect(repo.saveRunResult.mock.calls[0]![0]).toMatchObject({ runId: 'run-12345678', deliveryId: 'd1', verdict: 'fail', failed: false, logHash: 'abc' });
        expect(repo.createNotifications.mock.calls[0]![0]).toEqual([
            expect.objectContaining({ userId: 'buyer', title: 'Locked tests fail on J-1042, attempt 1' }),
            expect.objectContaining({ userId: 'seller' }),
        ]);
    });

    it('ignores a repeated runner callback', async () => {
        repo.getReviewRun.mockResolvedValue({ id: 'rr', status: 'done', delivery: { id: 'd1', attempt: 1, commitSha: 'abc', milestone: { job: { id: JOB, ref: 'J-1042', title: 'x', buyerId: 'buyer', seller: null } } } } as never);
        repo.saveRunResult.mockResolvedValue(0);
        await expect(service.runnerResult(runResult())).resolves.toMatchObject({ message: 'Runner Result Already Received' });
        expect(repo.createNotifications.mock.calls).toHaveLength(0);
    });

    it('refuses unknown runs and malformed results', async () => {
        repo.getReviewRun.mockResolvedValue(null);
        await expect(service.runnerResult(runResult())).rejects.toThrow('Test run not found');
        await expect(service.runnerResult({ runId: 'x' })).rejects.toThrow('Invalid runner result');
    });

    it('approves a delivery at two approvals', async () => {
        repo.getVoteTally.mockResolvedValue({ id: 'd1', status: 'reviewing', attempt: 1, milestoneId: 'm0', votes: [{ approve: true }, { approve: true }], milestone: { job: { id: JOB } } } as never);
        const res = await service.agentNotify({ role: 'reviewer', ok: true, jobId: JOB, result: { deliveryId: 'd1', reviewer: 2, approve: true } });
        expect(repo.settleDelivery.mock.calls[0]).toEqual(['d1', 'm0', JOB, true]);
        expect(res.actions).toEqual(expect.arrayContaining(['delivery approved', 'released']));
        expect(indexer.onMockRelease.mock.calls[0]?.[0]).toBe(JOB);
    });

    it('reopens the job at two rejections', async () => {
        repo.getVoteTally.mockResolvedValue({ id: 'd1', status: 'reviewing', attempt: 1, milestoneId: 'm0', votes: [{ approve: false }, { approve: true }, { approve: false }], milestone: { job: { id: JOB } } } as never);
        await service.agentNotify({ role: 'reviewer', ok: true, jobId: JOB, result: { deliveryId: 'd1', reviewer: 3, approve: false } });
        expect(repo.settleDelivery.mock.calls[0]).toEqual(['d1', 'm0', JOB, false]);
        expect(indexer.onMockRelease.mock.calls).toHaveLength(0);
        expect(repo.createNotifications.mock.calls[0]![0]).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Delivery 1 on J-1042 rejected by 2 of 3 reviewers', body: '2 attempts left.' })]));
    });

    it('waits while the vote is still open', async () => {
        repo.getVoteTally.mockResolvedValue({ id: 'd1', status: 'reviewing', attempt: 1, milestoneId: 'm0', votes: [{ approve: true }], milestone: { job: { id: JOB } } } as never);
        await service.agentNotify({ role: 'reviewer', ok: true, jobId: JOB, result: { deliveryId: 'd1', reviewer: 1, approve: true } });
        expect(repo.settleDelivery.mock.calls).toHaveLength(0);
    });

    it('records the re-check result on a disputed job without moving money', async () => {
        repo.getVoteTally.mockResolvedValue({ id: 'd1', status: 'reviewing', attempt: 1, milestoneId: 'm0', votes: [{ approve: false }, { approve: false }], milestone: { job: { id: JOB, status: 'disputed' } } } as never);
        const res = await service.agentNotify({ role: 'reviewer', ok: true, jobId: JOB, result: { deliveryId: 'd1', reviewer: 2, approve: false } });
        expect(repo.recordRecheck.mock.calls[0]?.slice(0, 2)).toEqual([JOB, 'refund']);
        expect(repo.settleDelivery.mock.calls).toHaveLength(0);
        expect(indexer.onMockRelease.mock.calls).toHaveLength(0);
        expect(res.actions).toEqual(expect.arrayContaining(['recheck refund']));
        const notes = repo.createNotifications.mock.calls[0]![0] as { userId: string; title: string }[];
        expect(notes.filter((n) => n.title.startsWith('Re-check on J-1042')).map((n) => n.userId)).toEqual(['buyer', 'seller']);
    });

    it('records a release re-check only once', async () => {
        repo.getVoteTally.mockResolvedValue({ id: 'd1', status: 'reviewing', attempt: 1, milestoneId: 'm0', votes: [{ approve: true }, { approve: true }, { approve: true }], milestone: { job: { id: JOB, status: 'disputed' } } } as never);
        repo.recordRecheck.mockResolvedValue(0);
        const res = await service.agentNotify({ role: 'reviewer', ok: true, jobId: JOB, result: { deliveryId: 'd1', reviewer: 3, approve: true } });
        expect(repo.recordRecheck.mock.calls[0]?.[1]).toBe('release');
        expect(res.actions).not.toContain('recheck release');
    });
});
