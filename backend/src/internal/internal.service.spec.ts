jest.mock('../prisma', () => ({ prisma: {} }));

import { AgentsService } from '../agents/agents.service';
import { ChainService } from '../chain/chain.service';
import { IndexerService } from '../indexer/indexer.service';
import { ReviewsService } from '../reviews/reviews.service';
import { InternalRepository } from './internal.repository';
import { bidFlagsOf, decideBid, HIDDEN_FAILED, InternalService, judgeRun } from './internal.service';

const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const BID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const OWNER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SELLER = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';

describe('InternalService', () => {
    let repo: jest.Mocked<InternalRepository>;
    let service: InternalService;
    let indexer: jest.Mocked<IndexerService>;
    let chain: jest.Mocked<ChainService>;
    let agents: jest.Mocked<AgentsService>;
    let reviews: jest.Mocked<ReviewsService>;

    beforeEach(() => {
        repo = {
            getJob: jest.fn().mockResolvedValue({ id: JOB, ref: 'J-1042', title: 'Split fix', buyerId: 'buyer', seller: { ownerId: 'seller' } }),
            getBid: jest.fn(), getReviewRun: jest.fn(), saveRunResult: jest.fn().mockResolvedValue(1), getVoteTally: jest.fn(), getAgentBid: jest.fn(), createHireOffer: jest.fn().mockResolvedValue({ id: 'offer-1' }), getOwner: jest.fn().mockResolvedValue({ id: OWNER }), pauseByGuardian: jest.fn().mockResolvedValue(1), settleDelivery: jest.fn().mockResolvedValue(1), recordRecheck: jest.fn().mockResolvedValue(1), setBidStatus: jest.fn().mockResolvedValue(1), createNotifications: jest.fn(async (n: unknown[]) => n.length),
        } as unknown as jest.Mocked<InternalRepository>;
        indexer = { onMockRelease: jest.fn().mockResolvedValue({ jobId: JOB, payout: 31.36, fee: 0.64 }) } as unknown as jest.Mocked<IndexerService>;
        chain = { callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-set_bid_flags-1', explorer_url: '', ok: true, result: null }) } as unknown as jest.Mocked<ChainService>;
        agents = {
            dispatch: jest.fn(async (flow: string) => ({ flow, runId: 'r', status: 'sent' })),
            dispatchBuyer: jest.fn().mockResolvedValue({ flow: 'buyer', runId: 'r', status: 'sent' }),
            dispatchBidding: jest.fn().mockResolvedValue({ flow: 'bidding', runId: 'r', status: 'sent' }),
        } as unknown as jest.Mocked<AgentsService>;
        reviews = { rerunStalled: jest.fn().mockResolvedValue({ round: 2 }) } as unknown as jest.Mocked<ReviewsService>;
        service = new InternalService(repo, indexer, chain, agents, reviews);
    });

    const bid = (extra: object) => ({ id: BID, onchainId: null, status: 'pending_check', price: 36, priceCheck: 'cleared', fraudScore: 6, holdReason: null, job: { id: JOB, ref: 'J-1042', onchainId: null, buyerId: 'buyer' }, seller: { displayName: 'patchsmith', ownerId: 'seller' }, ...extra });

    it('makes a checked offer live and tells the buyer', async () => {
        repo.getBid.mockResolvedValue(bid({}) as never);
        const res = await service.agentNotify({ role: 'fraud_lure', ok: true, jobId: JOB, result: { subjectType: 'bid', subjectId: BID, score: 6 } });
        expect(repo.setBidStatus.mock.calls[0]).toEqual([BID, 'pending_check', 'live', null]);
        expect(repo.createNotifications.mock.calls[0]![0]).toEqual([expect.objectContaining({ userId: 'buyer', title: 'New offer on J-1042', body: 'patchsmith offered 36.00 USDC' })]);
        expect(res.actions).toEqual(['bid live', 'bid flags on chain', 'buyer sent', 'notified 1']);
        expect(agents.dispatchBuyer.mock.calls[0]).toEqual([JOB]);
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
        expect(judgeRun(runResult({ holdoutExit: 101 }), true)).toEqual({ verdict: 'fail', reason: 'Hidden checks failed' });
        expect(judgeRun(runResult({ holdoutExit: 0 }), true)).toEqual({ verdict: 'pass', reason: null });
        expect(judgeRun(runResult({ holdoutExit: null }), true)).toEqual({ verdict: 'fail', reason: 'Hidden checks did not run' });
        expect(judgeRun(runResult({ exitCode: 101, holdoutExit: null }), true).reason).toBe('The locked tests fail');
    });

    it('saves a runner result and tells both sides', async () => {
        repo.getReviewRun.mockResolvedValue({ id: 'rr', status: 'running', delivery: { id: 'd1', attempt: 1, commitSha: 'abc', milestone: { job: { id: JOB, ref: 'J-1042', title: 'x', buyerId: 'buyer', seller: { ownerId: 'seller' }, acceptanceSpecs: [{ holdoutHash: null }] } } } } as never);
        await expect(service.runnerResult(runResult({ exitCode: 101 }))).resolves.toMatchObject({ verdict: 'fail', reason: 'The locked tests fail' });
        expect(repo.saveRunResult.mock.calls[0]![0]).toMatchObject({ runId: 'run-12345678', deliveryId: 'd1', verdict: 'fail', failed: false, logHash: 'abc' });
        expect(repo.createNotifications.mock.calls[0]![0]).toEqual([
            expect.objectContaining({ userId: 'buyer', title: 'Locked tests fail on J-1042, attempt 1' }),
            expect.objectContaining({ userId: 'seller' }),
        ]);
    });

    it('ignores a repeated runner callback', async () => {
        repo.getReviewRun.mockResolvedValue({ id: 'rr', status: 'done', delivery: { id: 'd1', attempt: 1, commitSha: 'abc', milestone: { job: { id: JOB, ref: 'J-1042', title: 'x', buyerId: 'buyer', seller: null, acceptanceSpecs: [] } } } } as never);
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

    const agentBid = (extra: object = {}) => ({
        id: BID, status: 'shortlisted', price: 36, job: { id: JOB, ref: 'J-1042', status: 'open', buyerId: 'buyer' },
        seller: { id: SELLER, ownerId: 'seller', agentId: 'agent-9', kind: 'agent', displayName: 'patchbot' }, ...extra,
    });

    it('passes a buyer agent counter to an agent seller and tells both sides', async () => {
        repo.getAgentBid.mockResolvedValue(agentBid() as never);
        const res = await service.agentNotify({ runId: 'r1', role: 'buyer', ok: true, jobId: JOB, result: { decision: 'counter', bidId: BID, offer: 30, round: 1 } });
        expect(agents.dispatchBidding.mock.calls[0]).toEqual([{ id: SELLER, ownerId: 'seller', agentId: 'agent-9', kind: 'agent', displayName: 'patchbot' }, JOB, 'negotiate']);
        expect(res.actions).toEqual(['counter sent', 'bidding sent', 'notified 2']);
        const notes = repo.createNotifications.mock.calls[0]![0] as { userId: string; body: string }[];
        expect(notes.map((n) => n.userId)).toEqual(['buyer', 'seller']);
        expect(notes[1]!.body).toBe('Counter at 30.00 USDC, round 1 of 3');
    });

    it('does not start a bidding agent for a human seller', async () => {
        repo.getAgentBid.mockResolvedValue(agentBid({ seller: { id: SELLER, ownerId: 'seller', agentId: null, kind: 'human', displayName: 'Ana' } }) as never);
        await service.agentNotify({ role: 'buyer', ok: true, jobId: JOB, result: { decision: 'counter', bidId: BID, offer: 30, round: 2 } });
        expect(agents.dispatchBidding.mock.calls).toHaveLength(0);
    });

    it('sends a hire offer when the buyer agent accepts a bid', async () => {
        repo.getAgentBid.mockResolvedValue(agentBid() as never);
        const res = await service.agentNotify({ role: 'buyer', ok: true, jobId: JOB, result: { decision: 'accept', bidId: BID, price: 34.5 } });
        expect(repo.createHireOffer.mock.calls[0]).toEqual([{ jobId: JOB, bidId: BID, sellerId: SELLER, price: 34.5 }]);
        expect(res.actions).toEqual(['hire offer sent', 'notified 2']);
    });

    it('does not offer twice, on a held bid, or on another job', async () => {
        repo.getAgentBid.mockResolvedValue(agentBid() as never);
        repo.createHireOffer.mockResolvedValue(null);
        expect((await service.agentNotify({ role: 'buyer', ok: true, jobId: JOB, result: { decision: 'accept', bidId: BID, price: 34 } })).actions).toEqual(['offer already sent']);
        repo.getAgentBid.mockResolvedValue(agentBid({ status: 'held' }) as never);
        expect((await service.agentNotify({ role: 'buyer', ok: true, jobId: JOB, result: { decision: 'accept', bidId: BID, price: 34 } })).actions).toEqual(['offer not possible']);
        repo.getAgentBid.mockResolvedValue(agentBid({ job: { id: 'other', ref: 'J-9', status: 'open', buyerId: 'x' } }) as never);
        expect((await service.agentNotify({ role: 'buyer', ok: true, jobId: JOB, result: { decision: 'accept', bidId: BID, price: 34 } })).actions).toEqual(['bid not found']);
        expect(repo.createHireOffer.mock.calls).toHaveLength(1);
    });

    it('waits quietly and reports a no deal to the buyer', async () => {
        expect((await service.agentNotify({ role: 'buyer', ok: true, jobId: JOB, result: { decision: 'wait', reason: '1 of 3 offers' } })).actions).toEqual(['buyer waiting']);
        repo.getAgentBid.mockResolvedValue(agentBid() as never);
        await service.agentNotify({ role: 'buyer', ok: true, jobId: JOB, result: { decision: 'no_deal', bidId: BID } });
        expect(repo.createNotifications.mock.calls[1]![0][0]).toMatchObject({ userId: 'buyer', title: 'No deal with patchbot on J-1042' });
    });

    it('starts the fraud and price checks on a bid from a bidding agent', async () => {
        repo.getAgentBid.mockResolvedValue(agentBid({ status: 'pending_check' }) as never);
        const res = await service.agentNotify({ role: 'bidding', ok: true, jobId: JOB, result: { action: 'bid', skip: null, bidId: BID, price: 36 } });
        expect(agents.dispatch.mock.calls).toEqual([
            ['fraud_lure', { ownerId: 'buyer', jobId: JOB, payload: { subjectType: 'bid', subjectId: BID } }],
        ]);
        expect(res.actions).toEqual(['bid checks started', 'notified 1']);
        expect(repo.createNotifications.mock.calls[0]![0][0]).toMatchObject({ userId: 'seller', title: 'Your agent bid on J-1042' });
    });

    it('runs the buyer agent again after a seller agent reply', async () => {
        repo.getAgentBid.mockResolvedValue(agentBid() as never);
        const res = await service.agentNotify({ role: 'bidding', ok: true, jobId: JOB, result: { action: 'negotiate', skip: null, bidId: BID, accept: false, price: 33 } });
        expect(agents.dispatchBuyer.mock.calls[0]).toEqual([JOB]);
        expect(res.actions).toEqual(['seller replied', 'buyer sent', 'notified 1']);
    });

    it('ignores a skipped or failed bidding run', async () => {
        expect((await service.agentNotify({ role: 'bidding', ok: true, jobId: JOB, result: { action: 'bid', skip: 'At capacity' } })).actions).toEqual(['bidding skipped']);
        expect((await service.agentNotify({ role: 'bidding', ok: false, jobId: JOB, error: 'LLM down' })).actions).toEqual(['bidding failed']);
        expect(repo.createNotifications.mock.calls.every((c) => (c[0] as unknown[]).length === 0)).toBe(true);
    });

    it('records a guardian pause and tells the owner', async () => {
        const res = await service.agentNotify({ runId: 'guardian-1', role: 'guardian', ok: true, jobId: null, result: { ownerId: OWNER, reasons: ['3 refused calls in 5 minutes'], pauseTx: 'mock-p1' } });
        expect(repo.pauseByGuardian.mock.calls[0]).toEqual([OWNER, 'mock-p1']);
        expect(res.actions).toEqual(['paused', 'notified 1']);
        expect(repo.createNotifications.mock.calls[0]![0][0]).toMatchObject({ userId: OWNER, kind: 'guardian', body: '3 refused calls in 5 minutes. Only you can unpause.' });
    });

    it('tells the owner when the guardian pause failed and ignores unknown owners', async () => {
        const res = await service.agentNotify({ role: 'guardian', ok: false, jobId: null, result: { ownerId: OWNER, reasons: ['spent 110 of the 120 USDC daily cap'], pauseTx: null }, error: 'Key guardian-buyer may not call pause' });
        expect(repo.pauseByGuardian.mock.calls).toHaveLength(0);
        expect(res.actions).toEqual(['pause failed', 'notified 1']);
        repo.getOwner.mockResolvedValue(null);
        expect((await service.agentNotify({ role: 'guardian', ok: true, jobId: null, result: { ownerId: OWNER } })).actions).toEqual(['owner not found']);
        expect((await service.agentNotify({ role: 'guardian', ok: true, jobId: null, result: { ownerId: 'nope' } })).actions).toEqual(['owner not found']);
    });

    it('refunds an expired job through the mock chain and tells both sides', async () => {
        const res = await service.agentNotify({ role: 'deadline_refund', ok: true, jobId: JOB, result: { method: 'refund_expired', txHash: 'mock-1' } });
        expect(chain.callAs.mock.calls[0]).toEqual(['platform', 'agora-testnet.testnet', 'refund_expired', { job_id: 'J-1042' }]);
        expect(res.actions).toEqual(['expired and refunded', 'notified 2']);
    });

    it('reports a refused deadline refund instead of failing', async () => {
        chain.callAs.mockRejectedValue(new Error('Contract refused refund_expired: Deadline has not passed'));
        const res = await service.agentNotify({ role: 'deadline_refund', ok: true, jobId: JOB, result: {} });
        expect(res.actions).toEqual(['refund_expired refused: Contract refused refund_expired: Deadline has not passed']);
    });

    it('does not move money when the timer call itself was refused', async () => {
        const res = await service.agentNotify({ role: 'deadline_refund', ok: false, jobId: JOB, result: {}, error: 'Contract refused' });
        expect(chain.callAs.mock.calls).toHaveLength(0);
        expect(res.actions).toEqual(['refund_expired refused']);
    });

    it('finalizes a dispute through the mock chain', async () => {
        const res = await service.agentNotify({ role: 'dispute_default', ok: true, jobId: JOB, result: {} });
        expect(chain.callAs.mock.calls[0]![2]).toBe('finalize_default');
        expect(res.actions).toEqual(['dispute finalized', 'notified 2']);
    });

    it('starts a fresh review round when the 12 hour timer fires and never releases', async () => {
        const res = await service.agentNotify({ role: 'review_timeout', ok: true, jobId: JOB, result: {} });
        expect(reviews.rerunStalled.mock.calls[0]).toEqual([JOB]);
        expect(indexer.onMockRelease.mock.calls).toHaveLength(0);
        expect(res.actions).toEqual(['review round 2 started']);
        reviews.rerunStalled.mockResolvedValue(null as never);
        expect((await service.agentNotify({ role: 'review_timeout', ok: true, jobId: JOB, result: {} })).actions).toEqual(['nothing to rerun']);
    });

    it('runs the buyer agent when the bid window ends', async () => {
        const res = await service.agentNotify({ runId: 'window-1', role: 'buyer_window', ok: true, jobId: JOB, result: { ownerId: 'buyer' } });
        expect(agents.dispatchBuyer.mock.calls[0]).toEqual([JOB]);
        expect(res.actions).toEqual(['buyer sent']);
    });

    it('fails a run whose hidden checks fail without revealing them', async () => {
        const secret = 'hidden_overflow_case';
        repo.getReviewRun.mockResolvedValue({ id: 'rr', status: 'running', delivery: { id: 'd1', attempt: 1, commitSha: 'abc', milestone: { job: { id: JOB, ref: 'J-1042', title: 'x', buyerId: 'buyer', seller: { ownerId: 'seller' }, acceptanceSpecs: [{ holdoutHash: 'ab'.repeat(32) }] } } } } as never);
        const out = await service.runnerResult({ ...runResult({ holdoutExit: 101, holdoutCounts: { passed: 3, failed: 1 } }), [secret]: secret });
        expect(out).toMatchObject({ verdict: 'fail', reason: HIDDEN_FAILED });
        const saved = repo.saveRunResult.mock.calls[0]![0];
        expect(saved).toMatchObject({ verdict: 'fail', reason: HIDDEN_FAILED, result: { holdout: { exitCode: 101, passed: 3, failed: 1 } } });
        const notes = repo.createNotifications.mock.calls[0]![0];
        expect(notes[0]).toMatchObject({ title: 'Hidden checks fail on J-1042, attempt 1', body: HIDDEN_FAILED });
        expect(JSON.stringify([out, saved, notes])).not.toContain(secret);
    });
});
