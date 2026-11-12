import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { AgentsService } from '../agents/agents.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ChainService } from '../chain/chain.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { holdoutRunOf } from '../holdout.js';
import { dispatchRun, testFilesOf } from '../runner.js';
import { DELIVERABLE_STATUSES, DeliveriesRepository, DeliveryRow, JobKey, ProofRow } from './deliveries.repository.js';
import { CreateDelivery } from './dto/CreateDelivery.dto.js';

export const MAX_ATTEMPTS = 3;
const REVIEWERS = 3;

const testsLabel = (exitCode: number | null | undefined): string =>
    exitCode === 0 ? 'Locked tests pass' : exitCode === null || exitCode === undefined ? '' : 'Locked tests fail';

export const resultLabel = (row: Pick<DeliveryRow, 'status' | 'verdict' | 'reason' | 'votes' | 'reviewRuns'>): string => {
    const approvals = row.votes.filter((v) => v.approve).length;
    const run = row.reviewRuns[0];
    if (row.status === 'approved') return `approved ${approvals} of ${REVIEWERS}`;
    if (row.status === 'rejected') return `rejected ${approvals} of ${REVIEWERS}`;
    if (run?.status === 'failed' && !row.verdict) return 'Runner unavailable';
    if (!row.verdict) return 'Tests running';
    if (row.verdict === 'pass') return row.votes.length ? `Reviewers voting, ${approvals} of ${REVIEWERS} approved` : 'Tests pass, reviewers voting';
    return `Tests failed: ${row.reason ?? 'see the log'}`;
};

export const toDelivery = (row: DeliveryRow, explorer: (tx: string) => string) => ({
    id: row.id,
    milestone: row.milestone.idx,
    attempt: row.attempt,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - row.attempt),
    commit: row.commitSha.slice(0, 7),
    commitSha: row.commitSha,
    repoUrl: row.repoUrl,
    status: row.status,
    verdict: row.verdict,
    reason: row.reason,
    result: resultLabel(row),
    tests: testsLabel(row.reviewRuns[0]?.exitCode),
    votes: row.votes.map((v) => (v.approve ? 1 : 0)),
    filesTouched: row.filesTouched,
    diffStats: row.diffStats,
    submitTx: row.submitTx,
    explorer: row.submitTx ? explorer(row.submitTx) : null,
    at: row.createdAt,
});

export const toProof = (row: ProofRow, explorer: (tx: string) => string) => ({
    ...toDelivery(row, explorer),
    job: row.milestone.job.ref,
    title: row.milestone.job.title,
    baseCommit: row.milestone.job.baseCommit,
    seller: row.milestone.job.seller?.nearAccountId ?? null,
    runs: row.reviewRuns.map((r) => ({
        runId: r.runId, round: r.round, status: r.status, exitCode: r.exitCode, installExit: r.installExit, baselineExitCode: r.baselineExitCode,
        scopeOk: r.scopeOk, changedFiles: r.changedFiles, logHash: r.logHash, logPath: r.logPath, durationMs: r.durationMs, error: r.error,
        result: r.result, startedAt: r.startedAt, finishedAt: r.finishedAt,
    })),
    reviewers: row.votes.map((v) => ({
        reviewer: v.reviewerAgent.label, approve: v.approve, model: v.model, checks: v.checkResults, logHash: v.logHash, logPath: v.logPath,
        attestation: v.attestationHash, voteTx: v.voteTx, explorer: v.voteTx ? explorer(v.voteTx) : null, at: v.createdAt,
    })),
});

@Injectable()
export class DeliveriesService {
    constructor(
        private readonly deliveriesRepository: DeliveriesRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
        private readonly agentsService: AgentsService,
    ) {}

    async createDelivery(token: string, body: CreateDelivery) {
        const authId = await this.authId(token);
        const idx = body.milestone_idx ?? 0;
        const job = await this.deliveriesRepository.getJobForDelivery(this.jobKey(body.job_id), idx);
        if (!job) throw new NotFoundException('Job not found');
        if (!job.seller || job.seller.ownerId !== authId) throw new ForbiddenException('Only the hired seller can deliver this job');
        if (job.status === 'delivered') throw new ConflictException('Wait for the reviewers to finish the last attempt');
        if (job.status === 'agreed') throw new BadRequestException('The buyer has not protected the payment yet. Deliver once the job is funded');
        if (!(DELIVERABLE_STATUSES as readonly string[]).includes(job.status)) throw new BadRequestException(`This job cannot take a delivery while it is ${job.status.replace('_', ' ')}`);
        const milestone = job.milestones[0];
        if (!milestone) throw new BadRequestException(`Milestone ${idx} is not funded yet`);
        const last = milestone.deliveries[0];
        if (last && ['submitted', 'reviewing'].includes(last.status)) throw new ConflictException('Wait for the reviewers to finish the last attempt');
        const attempt = (last?.attempt ?? 0) + 1;
        if (attempt > MAX_ATTEMPTS + (await this.deliveriesRepository.extraAttempts(job.id))) throw new BadRequestException('No attempts left. The buyer can refund or grant one more attempt');
        const spec = job.acceptanceSpecs[0];
        if (!spec) throw new BadRequestException('This job has no locked spec');
        const repoUrl = body.repo_url ?? job.repoUrl;
        if (!repoUrl) throw new BadRequestException('Add the repository URL of your delivery');

        const chain = await this.chainService.callAs('owner', job.seller.nearAccountId, 'submit_delivery', {
            job_id: job.onchainId?.toString() ?? job.ref,
            commit_hash: body.commit_sha,
        });
        const runId = randomUUID();
        let created: { id: string; attempt: number };
        try {
            created = await this.deliveriesRepository.createDelivery({
                jobId: job.id, milestoneId: milestone.id, sellerId: job.seller.id, attempt, commitSha: body.commit_sha, repoUrl,
                submitTx: chain.tx_hash, runId, buyerId: job.buyerId, title: job.title,
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This attempt was already delivered');
            throw e;
        }

        const runner = await dispatchRun({
            repoUrl,
            commit: body.commit_sha,
            baseCommit: job.baseCommit ?? 'main',
            testCommand: spec.testCommand,
            buildCommand: spec.buildCommand,
            testFiles: testFilesOf(spec.testFiles),
            allowedPaths: spec.allowedPaths,
            failingTests: spec.failingTests,
            ...holdoutRunOf(spec),
            runId,
            deliveryId: created.id,
        });
        await this.deliveriesRepository.setRunStatus(runId, runner === 'queued' ? 'running' : 'failed', runner === 'queued' ? null : 'Runner unavailable');
        const reviewers = await this.agentsService.dispatchReviewers(job.buyerId, job.id, created.id);

        return {
            message: 'Delivery Successfully Submitted',
            id: created.id,
            attempt: created.attempt,
            attemptsLeft: MAX_ATTEMPTS - created.attempt,
            runId,
            runner,
            reviewers: reviewers.filter((r) => r.status === 'sent').length,
            submitTx: chain.tx_hash,
            explorer: chain.explorer_url,
        };
    }

    async getDeliveries(token: string, job: string) {
        const authId = await this.authId(token);
        const key = this.jobKey(job);
        if (!(await this.deliveriesRepository.isParty(authId, key))) throw new NotFoundException('Job not found');
        const rows = await this.deliveriesRepository.listDeliveries(authId, key);
        return { items: rows.map((r) => toDelivery(r, (tx) => this.chainService.explorerTxUrl(tx))), maxAttempts: MAX_ATTEMPTS };
    }

    async getProof(token: string, id: string) {
        const authId = await this.authId(token);
        if (!isUUID(id)) throw new BadRequestException('Delivery id must be a valid id');
        const row = await this.deliveriesRepository.getProof(authId, id);
        if (!row) throw new NotFoundException('Delivery not found');
        return toProof(row, (tx) => this.chainService.explorerTxUrl(tx));
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
