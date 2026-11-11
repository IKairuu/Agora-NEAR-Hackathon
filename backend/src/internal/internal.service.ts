import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AgentsService } from '../agents/agents.service.js';
import { chainBidId, chainJobId, ChainService } from '../chain/chain.service.js';
import { IndexerService } from '../indexer/indexer.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { InternalRepository, NotificationInput } from './internal.repository.js';

export const agentNotifySchema = z.object({
    runId: z.string().max(100).nullish(),
    role: z.string().min(1).max(40),
    ok: z.boolean(),
    jobId: z.string().uuid().nullish(),
    result: z.record(z.string(), z.unknown()).nullish(),
    error: z.string().max(2000).nullish(),
});

export type AgentNotify = z.infer<typeof agentNotifySchema>;

export const decideBid = (bid: { status: string; priceCheck: string | null; fraudScore: number | null; holdReason: string | null }): { status: 'live' | 'held'; reason: string | null } | null => {
    if (!['pending_check', 'live'].includes(bid.status)) return null;
    if (bid.priceCheck === 'held') return { status: 'held', reason: bid.holdReason ?? 'Price far from the usual range' };
    if (bid.fraudScore !== null && bid.fraudScore >= 70) return { status: 'held', reason: bid.holdReason ?? 'High fraud and lure risk' };
    if (bid.fraudScore !== null && bid.fraudScore >= 40) return { status: 'held', reason: bid.holdReason ?? 'Needs your OK: medium risk' };
    if (bid.status === 'pending_check' && bid.fraudScore !== null && bid.priceCheck !== null) return { status: 'live', reason: null };
    return null;
};

export const runResultSchema = z.object({
    runId: z.string().min(8).max(64),
    deliveryId: z.string().nullish(),
    error: z.enum(['clone_failed', 'bad_commit', 'timeout', 'docker_failed', 'internal']).nullable(),
    exitCode: z.number().int().nullable(),
    installExit: z.number().int().nullable(),
    baselineExitCode: z.number().int().nullable(),
    changedFiles: z.array(z.string()),
    scopeOk: z.boolean().nullable(),
    diffStats: z.object({ files: z.number().int(), insertions: z.number().int(), deletions: z.number().int() }),
    logTail: z.string(),
    logSha256: z.string(),
    logPath: z.string(),
    durationMs: z.number().int(),
    timedOut: z.boolean(),
    holdoutExit: z.number().int().nullish(),
    holdoutCounts: z.object({ passed: z.number().int().min(0), failed: z.number().int().min(0) }).nullish(),
    failingTests: z.array(z.string()),
    image: z.string(),
    steps: z.array(z.object({ name: z.string(), exitCode: z.number().int().nullable(), durationMs: z.number().int() })),
});

export type RunResult = z.infer<typeof runResultSchema>;

const RUN_ERRORS: Record<string, string> = {
    clone_failed: 'Could not clone the repository',
    bad_commit: 'Commit not found or not built on the base commit',
    timeout: 'Tests ran out of time',
    docker_failed: 'The test sandbox failed',
    internal: 'The test runner failed',
};

const isTestPath = (p: string): boolean => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./.test(p);

export const HIDDEN_FAILED = 'Hidden checks failed';
export const HIDDEN_MISSING = 'Hidden checks did not run';

export const judgeRun = (r: Pick<RunResult, 'error' | 'exitCode' | 'installExit' | 'scopeOk' | 'changedFiles' | 'holdoutExit'>, hasHoldout = false): { verdict: 'pass' | 'fail'; reason: string | null } => {
    if (r.error) return { verdict: 'fail', reason: RUN_ERRORS[r.error] ?? r.error };
    if (r.changedFiles.length === 0) return { verdict: 'fail', reason: 'The commit changes no files' };
    const tests = r.changedFiles.filter(isTestPath);
    if (tests.length) return { verdict: 'fail', reason: `Edits test files: ${tests.slice(0, 3).join(', ')}` };
    if (r.scopeOk === false) return { verdict: 'fail', reason: 'Edits files outside the allowed paths' };
    if (r.installExit !== null && r.installExit !== 0) return { verdict: 'fail', reason: 'The build failed' };
    if (r.exitCode !== 0) return { verdict: 'fail', reason: 'The locked tests fail' };
    const hidden = r.holdoutExit ?? null;
    if (hidden !== null && hidden !== 0) return { verdict: 'fail', reason: HIDDEN_FAILED };
    if (hasHoldout && hidden === null) return { verdict: 'fail', reason: HIDDEN_MISSING };
    return { verdict: 'pass', reason: null };
};

export const bidFlagsOf = (bid: { priceCheck: string | null; fraudScore: number | null }) => ({
    price_check_ok: bid.priceCheck !== 'held',
    fraud_score: Math.min(100, Math.max(0, Math.round(bid.fraudScore ?? 0))),
    held: bid.priceCheck === 'held',
});

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

const amount = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) / 1e6 : null;
};

const usdc = (n: number): string => `${n.toFixed(2)} USDC`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const HIREABLE_BID = ['pending_check', 'live', 'shortlisted'];
const NEGOTIABLE_JOB = ['open', 'negotiating'];

type NotifyJob = NonNullable<Awaited<ReturnType<InternalRepository['getJob']>>>;

@Injectable()
export class InternalService {
    constructor(
        private readonly internalRepository: InternalRepository,
        private readonly indexer: IndexerService,
        private readonly chainService: ChainService,
        private readonly agentsService: AgentsService,
        private readonly reviewsService: ReviewsService,
    ) {}

    async agentNotify(raw: unknown) {
        const parsed = agentNotifySchema.safeParse(raw);
        if (!parsed.success) throw new BadRequestException(`Invalid agent result: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
        const body = parsed.data;
        const result = body.result ?? {};
        const actions: string[] = [];
        const notes: NotificationInput[] = [];
        const job = body.jobId ? await this.internalRepository.getJob(body.jobId) : null;

        if (body.role === 'price_check' || body.role === 'fraud_lure') {
            const bidId = text(result['bidId']) ?? (result['subjectType'] === 'bid' ? text(result['subjectId']) : null);
            const bid = bidId ? await this.internalRepository.getBid(bidId) : null;
            const decision = bid ? decideBid(bid) : null;
            if (bid && decision && decision.status !== bid.status) {
                const count = await this.internalRepository.setBidStatus(bid.id, bid.status, decision.status, decision.reason);
                if (count > 0) {
                    actions.push(`bid ${decision.status}`);
                    actions.push(await this.flagBid(bid));
                    const price = Number(bid.price).toFixed(2);
                    notes.push(decision.status === 'live'
                        ? { userId: bid.job.buyerId, kind: 'offer', title: `New offer on ${bid.job.ref}`, body: `${bid.seller.displayName} offered ${price} USDC`, link: `/job?id=${bid.job.ref}` }
                        : { userId: bid.job.buyerId, kind: 'held', title: `Held an offer on ${bid.job.ref}`, body: `${bid.seller.displayName}: ${decision.reason}`, link: `/job?id=${bid.job.ref}` });
                    if (decision.status === 'held') {
                        notes.push({ userId: bid.seller.ownerId, kind: 'held', title: `Your offer on ${bid.job.ref} is held`, body: `${decision.reason}. You can explain why it is fair.`, link: '/orders' });
                    } else {
                        actions.push(`buyer ${(await this.agentsService.dispatchBuyer(bid.job.id)).status}`);
                    }
                }
            }
        } else if (body.role === 'spec_writer' && job) {
            const weak = result['failsOnBase'] === false;
            notes.push({ userId: job.buyerId, kind: 'spec', title: weak ? `Draft spec for ${job.ref} needs your review` : `Draft spec ready for ${job.ref}`, body: job.title, link: `/job?id=${job.ref}` });
        } else if (body.role === 'reviewer' && job) {
            const verdict = result['approve'] === true ? 'approved' : 'rejected';
            const reviewer = typeof result['reviewer'] === 'number' || typeof result['reviewer'] === 'string' ? `Reviewer ${result['reviewer']}` : 'A reviewer';
            const title = `${reviewer} ${verdict} the delivery on ${job.ref}`;
            notes.push({ userId: job.buyerId, kind: 'review', title, body: null, link: `/job?id=${job.ref}` });
            if (job.seller?.ownerId) notes.push({ userId: job.seller.ownerId, kind: 'review', title, body: null, link: '/orders' });
            const deliveryId = text(result['deliveryId']);
            const tally = deliveryId ? await this.internalRepository.getVoteTally(deliveryId) : null;
            if (tally) {
                const approvals = tally.votes.filter((v) => v.approve).length;
                const rejections = tally.votes.length - approvals;
                if ((approvals >= 2 || rejections >= 2) && tally.milestone.job.status === 'disputed') {
                    const outcome = approvals >= 2 ? 'release' : 'refund';
                    const count = await this.internalRepository.recordRecheck(tally.milestone.job.id, outcome, new Date());
                    if (count > 0) {
                        actions.push(`recheck ${outcome}`);
                        const title = `Re-check on ${job.ref}: ${outcome === 'release' ? `${approvals} of 3 reviewers approve, so the seller should be paid` : `${rejections} of 3 reviewers reject, so the buyer should be refunded`}`;
                        const body = 'No money moves yet. The side that disagrees can ask the DAO with a bond within 72 hours; otherwise this result stands.';
                        notes.push({ userId: job.buyerId, kind: 'dispute', title, body, link: '/dispute' });
                        if (job.seller?.ownerId) notes.push({ userId: job.seller.ownerId, kind: 'dispute', title, body, link: '/dispute' });
                    }
                } else if (approvals >= 2 || rejections >= 2) {
                    const approved = approvals >= 2;
                    const count = await this.internalRepository.settleDelivery(tally.id, tally.milestoneId, tally.milestone.job.id, approved);
                    if (count > 0) {
                        actions.push(`delivery ${approved ? 'approved' : 'rejected'}`);
                        if (approved && (process.env['AGORA_CHAIN_MODE'] ?? 'mock') === 'mock') {
                            const released = await this.indexer.onMockRelease(tally.milestone.job.id, `mock-release-${Date.now()}`);
                            if (released) actions.push('released');
                        }
                        const outcome = approved
                            ? `Delivery ${tally.attempt} on ${job.ref} approved by ${approvals} of 3 reviewers`
                            : `Delivery ${tally.attempt} on ${job.ref} rejected by ${rejections} of 3 reviewers`;
                        const next = approved ? 'Payment is released by the contract.' : tally.attempt >= 3 ? 'No attempts left.' : `${3 - tally.attempt} attempt${3 - tally.attempt === 1 ? '' : 's'} left.`;
                        notes.push({ userId: job.buyerId, kind: 'review', title: outcome, body: next, link: `/job?id=${job.ref}` });
                        if (job.seller?.ownerId) notes.push({ userId: job.seller.ownerId, kind: 'review', title: outcome, body: next, link: '/orders' });
                    }
                }
            }
        } else if (body.role === 'buyer' && body.ok && job) {
            await this.onBuyer(job, result, actions, notes);
        } else if (body.role === 'bidding' && body.ok && job) {
            await this.onBidding(job, result, actions, notes);
        } else if (body.role === 'bidding') {
            actions.push('bidding failed');
        } else if (body.role === 'guardian') {
            await this.onGuardian(body.ok, body.error ?? null, result, actions, notes);
        } else if (body.role === 'review_timeout' && job) {
            await this.onReviewTimeout(job, body.ok, actions);
        } else if (body.role === 'deadline_refund' && job) {
            await this.onTimerCall(job, body.ok, 'refund_expired', actions, notes);
        } else if (body.role === 'dispute_default' && job) {
            await this.onTimerCall(job, body.ok, 'finalize_default', actions, notes);
        } else if (body.role === 'buyer_window' && job) {
            actions.push(`buyer ${(await this.agentsService.dispatchBuyer(job.id)).status}`);
        } else if (!body.ok && job) {
            notes.push({ userId: job.buyerId, kind: 'agent', title: `Your ${body.role.replace(/_/g, ' ')} agent hit a problem on ${job.ref}`, body: body.error ?? null, link: `/job?id=${job.ref}` });
        }

        const notified = await this.internalRepository.createNotifications(notes);
        if (notified > 0) actions.push(`notified ${notified}`);
        return { message: 'Agent Result Successfully Received', role: body.role, actions };
    }

    private async onBuyer(job: NotifyJob, result: Record<string, unknown>, actions: string[], notes: NotificationInput[]) {
        const decision = text(result['decision']);
        if (decision === 'wait' || !decision) {
            actions.push('buyer waiting');
            return;
        }
        const bidId = text(result['bidId']);
        const bid = bidId && UUID.test(bidId) ? await this.internalRepository.getAgentBid(bidId) : null;
        if (!bid || bid.job.id !== job.id) {
            actions.push('bid not found');
            return;
        }
        const seller = bid.seller.displayName;
        if (decision === 'counter') {
            const offer = amount(result['offer']);
            const round = typeof result['round'] === 'number' ? result['round'] : null;
            const terms = `${offer !== null ? usdc(offer) : 'a lower price'}${round !== null ? `, round ${round} of 3` : ''}`;
            notes.push({ userId: job.buyerId, kind: 'offer', title: `Your agent countered ${seller} on ${job.ref}`, body: `Counter at ${terms}`, link: `/job?id=${job.ref}` });
            notes.push({ userId: bid.seller.ownerId, kind: 'offer', title: `The buyer's agent countered your offer on ${job.ref}`, body: `Counter at ${terms}`, link: '/orders' });
            actions.push('counter sent');
            if (bid.seller.kind === 'agent') actions.push(`bidding ${(await this.agentsService.dispatchBidding(bid.seller, job.id, 'negotiate')).status}`);
            return;
        }
        if (decision === 'accept') {
            const price = amount(result['price']) ?? Number(bid.price);
            if (!NEGOTIABLE_JOB.includes(bid.job.status) || !HIREABLE_BID.includes(bid.status) || bid.seller.ownerId === job.buyerId) {
                actions.push('offer not possible');
                return;
            }
            const offer = await this.internalRepository.createHireOffer({ jobId: job.id, bidId: bid.id, sellerId: bid.seller.id, price });
            if (!offer) {
                actions.push('offer already sent');
                return;
            }
            actions.push('hire offer sent');
            notes.push({ userId: job.buyerId, kind: 'offer', title: `Your agent chose ${seller} on ${job.ref}`, body: `Hire offer sent at ${usdc(price)}. Funding starts when the seller accepts.`, link: `/job?id=${job.ref}` });
            notes.push({ userId: bid.seller.ownerId, kind: 'offer', title: `Hire offer on ${job.ref}`, body: `The buyer offers ${usdc(price)}. Accept it to start.`, link: '/orders' });
            return;
        }
        if (decision === 'no_deal') {
            actions.push('no deal');
            notes.push({ userId: job.buyerId, kind: 'agent', title: `No deal with ${seller} on ${job.ref}`, body: 'The offer is still above your budget after 3 rounds.', link: `/job?id=${job.ref}` });
        }
    }

    private async onBidding(job: NotifyJob, result: Record<string, unknown>, actions: string[], notes: NotificationInput[]) {
        if (text(result['skip'])) {
            actions.push('bidding skipped');
            return;
        }
        const bidId = text(result['bidId']);
        const bid = bidId && UUID.test(bidId) ? await this.internalRepository.getAgentBid(bidId) : null;
        if (!bid || bid.job.id !== job.id) {
            actions.push('no bid');
            return;
        }
        const price = amount(result['price']) ?? Number(bid.price);
        if (result['action'] === 'negotiate') {
            const accepted = result['accept'] === true;
            const title = accepted ? `${bid.seller.displayName} accepted your agent's counter on ${job.ref}` : `${bid.seller.displayName} answered your agent on ${job.ref}`;
            notes.push({ userId: job.buyerId, kind: 'offer', title, body: `Price now ${usdc(price)}`, link: `/job?id=${job.ref}` });
            actions.push(accepted ? 'counter accepted' : 'seller replied');
            actions.push(`buyer ${(await this.agentsService.dispatchBuyer(job.id)).status}`);
            return;
        }
        await this.agentsService.dispatch('fraud_lure', { ownerId: job.buyerId, jobId: job.id, payload: { subjectType: 'bid', subjectId: bid.id } });
        actions.push('bid checks started');
        notes.push({ userId: bid.seller.ownerId, kind: 'offer', title: `Your agent bid on ${job.ref}`, body: `${usdc(price)}. The fraud and price checks run before the buyer sees it.`, link: '/orders' });
    }

    private async onGuardian(ok: boolean, error: string | null, result: Record<string, unknown>, actions: string[], notes: NotificationInput[]) {
        const ownerId = text(result['ownerId']);
        if (!ownerId || !UUID.test(ownerId) || !(await this.internalRepository.getOwner(ownerId))) {
            actions.push('owner not found');
            return;
        }
        const reasons = Array.isArray(result['reasons']) ? result['reasons'].filter((r): r is string => typeof r === 'string').slice(0, 5) : [];
        const why = reasons.length ? reasons.join('; ') : 'unusual activity';
        if (ok) {
            const paused = await this.internalRepository.pauseByGuardian(ownerId, text(result['pauseTx']));
            actions.push(paused > 0 ? 'paused' : 'already paused');
            notes.push({ userId: ownerId, kind: 'guardian', title: 'Your guardian paused your agents', body: `${why}. Only you can unpause.`, link: '/agents' });
            return;
        }
        actions.push('pause failed');
        notes.push({ userId: ownerId, kind: 'guardian', title: 'Your guardian tried to pause your agents', body: `${why}. The pause call failed${error ? `: ${error.slice(0, 300)}` : ''}. Check your limits.`, link: '/mandate' });
    }

    private async onReviewTimeout(job: NotifyJob, ok: boolean, actions: string[]) {
        if (!ok) {
            actions.push('review timer refused');
            return;
        }
        try {
            const rerun = await this.reviewsService.rerunStalled(job.id);
            actions.push(rerun ? `review round ${rerun.round} started` : 'nothing to rerun');
        } catch (e) {
            actions.push(`rerun skipped: ${e instanceof Error ? e.message : 'unknown error'}`);
        }
    }

    private async onTimerCall(job: NotifyJob, ok: boolean, method: 'refund_expired' | 'finalize_default', actions: string[], notes: NotificationInput[]) {
        if (!ok) {
            actions.push(`${method} refused`);
            return;
        }
        if ((process.env['AGORA_CHAIN_MODE'] ?? 'mock') === 'mock') {
            try {
                const platform = process.env['AGORA_PLATFORM_ACCOUNT'] ?? 'agora-testnet.testnet';
                await this.chainService.callAs('platform', platform, method, { job_id: chainJobId(job) });
            } catch (e) {
                actions.push(`${method} refused: ${e instanceof Error ? e.message : 'unknown error'}`);
                return;
            }
        }
        actions.push(method === 'refund_expired' ? 'expired and refunded' : 'dispute finalized');
        const title = method === 'refund_expired' ? `Deadline passed on ${job.ref}, payment refunded` : `Dispute on ${job.ref} finalized`;
        const body = method === 'refund_expired' ? 'The seller did not deliver in time, so the protected money went back to the buyer.' : 'Nobody escalated in time, so the re-check result stands.';
        notes.push({ userId: job.buyerId, kind: method === 'refund_expired' ? 'review' : 'dispute', title, body, link: `/job?id=${job.ref}` });
        if (job.seller?.ownerId) notes.push({ userId: job.seller.ownerId, kind: method === 'refund_expired' ? 'review' : 'dispute', title, body, link: '/orders' });
    }

    private async flagBid(bid: { id: string; onchainId: bigint | null; priceCheck: string | null; fraudScore: number | null; job: { ref: string; onchainId: bigint | null } }): Promise<string> {
        try {
            const oracle = process.env['AGORA_FRAUD_ORACLE_ACCOUNT'] ?? 'oracle.agora-testnet.testnet';
            await this.chainService.callAs('fraud_oracle', oracle, 'set_bid_flags', { job_id: chainJobId(bid.job), bid_id: chainBidId(bid), ...bidFlagsOf(bid) });
            return 'bid flags on chain';
        } catch {
            return 'bid flags not on chain';
        }
    }

    async runnerResult(raw: unknown) {
        const parsed = runResultSchema.safeParse(raw);
        if (!parsed.success) throw new BadRequestException(`Invalid runner result: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
        const r = parsed.data;
        const run = await this.internalRepository.getReviewRun(r.runId);
        if (!run) throw new NotFoundException('Test run not found');
        const job = run.delivery.milestone.job;
        const hasHoldout = !!job.acceptanceSpecs[0]?.holdoutHash;
        const { verdict, reason } = judgeRun(r, hasHoldout);
        const saved = await this.internalRepository.saveRunResult({
            runId: r.runId,
            failed: r.error !== null,
            exitCode: r.exitCode,
            installExit: r.installExit,
            baselineExitCode: r.baselineExitCode,
            scopeOk: r.scopeOk,
            changedFiles: r.changedFiles,
            logHash: r.logSha256,
            logPath: r.logPath,
            durationMs: r.durationMs,
            error: r.error,
            result: {
                timedOut: r.timedOut, failingTests: r.failingTests, image: r.image, steps: r.steps, logTail: r.logTail.slice(-8000),
                holdout: hasHoldout ? { exitCode: r.holdoutExit ?? null, passed: r.holdoutCounts?.passed ?? null, failed: r.holdoutCounts?.failed ?? null } : null,
            },
            deliveryId: run.delivery.id,
            verdict,
            reason,
            diffStats: r.diffStats,
        });
        if (saved === 0) return { message: 'Runner Result Already Received', runId: r.runId, verdict };
        const hiddenFail = reason === HIDDEN_FAILED || reason === HIDDEN_MISSING;
        const title = verdict === 'pass'
            ? `Locked tests pass on ${job.ref}, attempt ${run.delivery.attempt}`
            : `${hiddenFail ? 'Hidden checks fail' : 'Locked tests fail'} on ${job.ref}, attempt ${run.delivery.attempt}`;
        const body = verdict === 'pass' ? 'The three reviewers are voting.' : reason;
        const notes: NotificationInput[] = [{ userId: job.buyerId, kind: 'review', title, body, link: `/job?id=${job.ref}` }];
        if (job.seller?.ownerId) notes.push({ userId: job.seller.ownerId, kind: 'review', title, body, link: '/orders' });
        await this.internalRepository.createNotifications(notes);
        return { message: 'Runner Result Successfully Received', runId: r.runId, verdict, reason };
    }
}
