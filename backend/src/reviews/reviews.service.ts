import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { AgentsService } from '../agents/agents.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ChainService } from '../chain/chain.service.js';
import { dispatchRun, testFilesOf } from '../runner.js';
import { CreateReview } from './dto/CreateReview.dto.js';
import { EvidenceRow, JobKey, PanelRow, ReviewsRepository } from './reviews.repository.js';

export const REVIEW_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const STALE_RUN_MS = 15 * 60 * 1000;
export const MAX_ROUNDS = 5;
const SLOTS = ['A', 'B', 'C'];
const OPEN = ['submitted', 'reviewing'];

export type RerunWhy = 'runner_failed' | 'split_vote' | 'timeout';

const WHY_TEXT: Record<RerunWhy, string> = {
    runner_failed: 'The last test run did not finish, so the tests run again.',
    split_vote: 'The reviewers split, so fresh reviewers check it.',
    timeout: 'No result after 12 hours, so fresh reviewers check it.',
};

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const short = (hash: string | null): string => (hash && hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash ?? '');

export const rerunWhy = (
    d: { status: string; createdAt: Date; votes: { approve: boolean }[] },
    run: { status: string; startedAt: Date } | undefined,
    now = Date.now(),
): RerunWhy | null => {
    if (!OPEN.includes(d.status)) return null;
    if (run && ['queued', 'running'].includes(run.status) && now - run.startedAt.getTime() < STALE_RUN_MS) return null;
    if (!run || run.status === 'failed' || ['queued', 'running'].includes(run.status)) return 'runner_failed';
    const approvals = d.votes.filter((v) => v.approve).length;
    const rejections = d.votes.length - approvals;
    if (approvals >= 1 && rejections >= 1 && approvals < 2 && rejections < 2) return 'split_vote';
    if (now - d.createdAt.getTime() >= REVIEW_TIMEOUT_MS) return 'timeout';
    return null;
};

type Reviewer = { id: string; label: string; model: string | null };

export const toPanel = (row: PanelRow | null, reviewers: Reviewer[], explorer: (tx: string) => string, now = Date.now()) => {
    const run = row?.reviewRuns[0];
    const testing = row !== null && OPEN.includes(row.status) && run?.status !== 'failed';
    const slots = reviewers.slice(0, 3).map((agent, i) => {
        const vote = row?.votes.find((v) => v.reviewerAgentId === agent.id);
        const state = vote ? (vote.approve ? 2 : 3) : testing ? 1 : 0;
        return {
            id: SLOTS[i]!,
            label: agent.label,
            model: vote?.model ?? agent.model ?? '',
            att: short(vote?.attestationHash ?? null),
            state,
            approve: vote ? vote.approve : null,
            log: short(vote?.logHash ?? null),
            voteTx: vote?.voteTx ?? null,
            explorer: vote?.voteTx ? explorer(vote.voteTx) : null,
            checks: vote?.checkResults ?? null,
        };
    });
    const approvals = row?.votes.filter((v) => v.approve).length ?? 0;
    const why = row ? rerunWhy(row, run, now) : null;
    return {
        deliveryId: row?.id ?? null,
        attempt: row?.attempt ?? null,
        commit: row ? row.commitSha.slice(0, 7) : null,
        status: row?.status ?? null,
        verdict: row?.verdict ?? null,
        reason: row?.reason ?? null,
        run: run ? {
            round: run.round, status: run.status, exitCode: run.exitCode, installExit: run.installExit, baselineExitCode: run.baselineExitCode,
            scopeOk: run.scopeOk, changedFiles: run.changedFiles, logHash: run.logHash, durationMs: run.durationMs, error: run.error,
        } : null,
        reviewers: slots,
        votes: slots.map((s) => s.state),
        approvals,
        rejections: (row?.votes.length ?? 0) - approvals,
        canRerun: why !== null,
        rerunWhy: why,
    };
};

export const toEvidence = (job: EvidenceRow, generatedAt: Date) => {
    const spec = job.acceptanceSpecs[0];
    const body = {
        standard: 'agora-evidence',
        version: '1.0.0',
        job: {
            ref: job.ref, title: job.title, status: job.status, repoUrl: job.repoUrl, baseCommit: job.baseCommit,
            price: job.agreedPrice === null ? null : Number(job.agreedPrice),
            buyer: job.buyer.nearAccountId ?? job.buyer.displayName, seller: job.seller?.nearAccountId ?? null,
            attemptsAllowed: 3,
        },
        spec: spec ? {
            version: spec.version, specHash: spec.specHash, holdoutHash: spec.holdoutHash, lockedAt: spec.lockedAt, lockTx: spec.lockTx,
            testCommand: spec.testCommand, buildCommand: spec.buildCommand, failingTests: spec.failingTests, allowedPaths: spec.allowedPaths,
            testFiles: testFilesOf(spec.testFiles).map((f) => ({ path: f.path, sha256: sha256(f.content) })),
            checks: spec.checks.map((c) => ({ name: c.name, howVerified: c.howVerified, weight: c.weight })),
        } : null,
        milestones: job.milestones.map((m) => ({
            idx: m.idx, amount: Number(m.amount), status: m.status, fundedTx: m.fundedTx, releasedTx: m.releasedTx,
            deliveries: m.deliveries.map((d) => ({
                attempt: d.attempt, commit: d.commitSha, repoUrl: d.repoUrl, status: d.status, verdict: d.verdict, reason: d.reason,
                filesTouched: d.filesTouched, diffStats: d.diffStats, submitTx: d.submitTx, at: d.createdAt,
                testRuns: d.reviewRuns.map((r) => ({
                    round: r.round, runId: r.runId, status: r.status, exitCode: r.exitCode, installExit: r.installExit, baselineExitCode: r.baselineExitCode,
                    scopeOk: r.scopeOk, changedFiles: r.changedFiles, logSha256: r.logHash, logPath: r.logPath, durationMs: r.durationMs, error: r.error,
                    startedAt: r.startedAt, finishedAt: r.finishedAt,
                })),
                votes: d.votes.map((v) => ({
                    reviewer: v.reviewerAgent.label, approve: v.approve, model: v.model, checks: v.checkResults, logSha256: v.logHash,
                    attestation: v.attestationHash, voteTx: v.voteTx, at: v.createdAt,
                })),
            })),
        })),
        chainTxs: job.chainTxs.map((t) => ({ method: t.method, txHash: t.txHash, signer: t.signerAccount, status: t.status, at: t.createdAt })),
        generatedAt,
    };
    return { ...body, bundleSha256: sha256(JSON.stringify(body)) };
};

@Injectable()
export class ReviewsService {
    constructor(
        private readonly reviewsRepository: ReviewsRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
        private readonly agentsService: AgentsService,
    ) {}

    async getReviews(token: string, job: string) {
        const authId = await this.authId(token);
        const key = this.jobKey(job);
        if (!(await this.reviewsRepository.isParty(authId, key))) throw new NotFoundException('Job not found');
        const [row, reviewers] = await Promise.all([this.reviewsRepository.getLatestDelivery(authId, key), this.reviewsRepository.getReviewers()]);
        return toPanel(row, reviewers, (tx) => this.chainService.explorerTxUrl(tx));
    }

    async getEvidence(token: string, job: string) {
        const authId = await this.authId(token);
        const row = await this.reviewsRepository.getEvidence(authId, this.jobKey(job));
        if (!row) throw new NotFoundException('Job not found');
        return toEvidence(row, new Date());
    }

    async rerunReview(token: string, body: CreateReview) {
        const authId = await this.authId(token);
        if (!isUUID(body.delivery_id)) throw new BadRequestException('Delivery id must be a valid id');
        const d = await this.reviewsRepository.getRerunTarget(authId, body.delivery_id);
        if (!d) throw new NotFoundException('Delivery not found');
        if (!OPEN.includes(d.status)) throw new BadRequestException('This delivery is already decided');
        const last = d.reviewRuns[0];
        const why = rerunWhy(d, last);
        if (!why) {
            if (last && ['queued', 'running'].includes(last.status)) throw new ConflictException('The tests are still running');
            throw new BadRequestException('A rerun is allowed after a split vote, a failed test run, or 12 hours without a result');
        }
        const round = (last?.round ?? 0) + 1;
        if (round > MAX_ROUNDS) throw new BadRequestException(`No more than ${MAX_ROUNDS} review rounds per delivery`);
        const job = d.milestone.job;
        const spec = job.acceptanceSpecs[0];
        if (!spec) throw new BadRequestException('This job has no locked spec');

        let rerunTx: string | null = null;
        if (why !== 'runner_failed') {
            const platform = process.env['AGORA_PLATFORM_ACCOUNT'] ?? 'agora-testnet.testnet';
            const tx = await this.chainService.callAs('platform', platform, 'rerun_review', { job_id: job.onchainId?.toString() ?? job.ref });
            rerunTx = tx.tx_hash;
        }
        const runId = randomUUID();
        const reason = body.reason ? `${WHY_TEXT[why]} Note: ${body.reason}` : WHY_TEXT[why];
        const userIds = [job.buyerId, ...(job.seller ? [job.seller.ownerId] : [])];
        await this.reviewsRepository.createRerun({ deliveryId: d.id, round, runId, userIds, ref: job.ref, reason });
        const runner = await dispatchRun({
            repoUrl: d.repoUrl,
            commit: d.commitSha,
            baseCommit: job.baseCommit ?? 'main',
            testCommand: spec.testCommand,
            buildCommand: spec.buildCommand,
            testFiles: testFilesOf(spec.testFiles),
            allowedPaths: spec.allowedPaths,
            failingTests: spec.failingTests,
            runId,
            deliveryId: d.id,
        });
        await this.reviewsRepository.setRunStatus(runId, runner === 'queued' ? 'running' : 'failed', runner === 'queued' ? null : 'Runner unavailable');
        const reviewers = await this.agentsService.dispatchReviewers(job.buyerId, job.id, d.id);
        return { message: 'Review Successfully Rerun', id: d.id, round, runId, runner, reviewers: reviewers.filter((r) => r.status === 'sent').length, why, rerunTx };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job ?? '')) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }
}
