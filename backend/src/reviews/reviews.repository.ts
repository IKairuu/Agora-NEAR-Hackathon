import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const twoSided = (userId: string): Prisma.JobWhereInput => ({ OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] });

const voteSelect = {
    reviewerAgentId: true,
    approve: true,
    checkResults: true,
    logHash: true,
    logPath: true,
    attestationHash: true,
    model: true,
    voteTx: true,
    createdAt: true,
    reviewerAgent: { select: { label: true } },
} satisfies Prisma.ReviewerVoteSelect;

const runSelect = {
    runId: true,
    round: true,
    status: true,
    exitCode: true,
    installExit: true,
    baselineExitCode: true,
    scopeOk: true,
    changedFiles: true,
    logHash: true,
    logPath: true,
    durationMs: true,
    error: true,
    startedAt: true,
    finishedAt: true,
} satisfies Prisma.ReviewRunSelect;

const panelSelect = {
    id: true,
    attempt: true,
    commitSha: true,
    status: true,
    verdict: true,
    reason: true,
    createdAt: true,
    votes: { select: voteSelect, orderBy: { createdAt: 'asc' } },
    reviewRuns: { select: runSelect, orderBy: { round: 'desc' }, take: 1 },
} satisfies Prisma.DeliverySelect;

export type PanelRow = Prisma.DeliveryGetPayload<{ select: typeof panelSelect }>;

const evidenceSelect = {
    id: true,
    ref: true,
    title: true,
    status: true,
    repoUrl: true,
    baseCommit: true,
    agreedPrice: true,
    buyer: { select: { displayName: true, nearAccountId: true } },
    seller: { select: { displayName: true, nearAccountId: true } },
    acceptanceSpecs: {
        where: { lockedAt: { not: null } },
        select: {
            version: true, specHash: true, holdoutHash: true, lockedAt: true, lockTx: true, testCommand: true, buildCommand: true,
            failingTests: true, allowedPaths: true, testFiles: true,
            checks: { select: { position: true, name: true, howVerified: true, weight: true }, orderBy: { position: 'asc' } },
        },
        orderBy: { version: 'desc' },
        take: 1,
    },
    milestones: {
        select: {
            idx: true, amount: true, status: true, fundedTx: true, releasedTx: true,
            deliveries: {
                select: {
                    attempt: true, commitSha: true, repoUrl: true, status: true, verdict: true, reason: true, filesTouched: true, diffStats: true,
                    submitTx: true, createdAt: true,
                    reviewRuns: { select: runSelect, orderBy: { round: 'asc' } },
                    votes: { select: voteSelect, orderBy: { createdAt: 'asc' } },
                },
                orderBy: { attempt: 'asc' },
            },
        },
        orderBy: { idx: 'asc' },
    },
    chainTxs: { select: { method: true, txHash: true, signerAccount: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.JobSelect;

export type EvidenceRow = Prisma.JobGetPayload<{ select: typeof evidenceSelect }>;

const rerunSelect = {
    id: true,
    status: true,
    commitSha: true,
    repoUrl: true,
    createdAt: true,
    votes: { select: { approve: true } },
    reviewRuns: { select: { round: true, status: true, startedAt: true }, orderBy: { round: 'desc' }, take: 1 },
    milestone: {
        select: {
            job: {
                select: {
                    id: true, ref: true, onchainId: true, baseCommit: true, buyerId: true,
                    seller: { select: { ownerId: true } },
                    acceptanceSpecs: {
                        where: { lockedAt: { not: null } },
                        select: { testCommand: true, buildCommand: true, failingTests: true, allowedPaths: true, testFiles: true },
                        orderBy: { version: 'desc' },
                        take: 1,
                    },
                },
            },
        },
    },
} satisfies Prisma.DeliverySelect;

export type RerunRow = Prisma.DeliveryGetPayload<{ select: typeof rerunSelect }>;

export interface NewRerun {
    deliveryId: string;
    round: number;
    runId: string;
    userIds: string[];
    ref: string;
    reason: string;
}

@Injectable()
export class ReviewsRepository {
    async getReviewers() {
        return prisma.agent.findMany({ where: { role: 'reviewer' }, select: { id: true, label: true, model: true }, orderBy: { label: 'asc' }, take: 3 });
    }

    async isParty(userId: string, key: JobKey) {
        const job = await prisma.job.findFirst({ where: { ...key, ...twoSided(userId) }, select: { id: true } });
        return job !== null;
    }

    async getLatestDelivery(userId: string, key: JobKey) {
        return prisma.delivery.findFirst({
            where: { milestone: { job: { ...key, ...twoSided(userId) } } },
            select: panelSelect,
            orderBy: { createdAt: 'desc' },
        });
    }

    async getEvidence(userId: string, key: JobKey) {
        return prisma.job.findFirst({ where: { ...key, ...twoSided(userId) }, select: evidenceSelect });
    }

    async getRerunTarget(userId: string, deliveryId: string) {
        return prisma.delivery.findFirst({ where: { id: deliveryId, milestone: { job: twoSided(userId) } }, select: rerunSelect });
    }

    async createRerun(r: NewRerun) {
        return prisma.$transaction(async (tx) => {
            const run = await tx.reviewRun.create({ data: { deliveryId: r.deliveryId, round: r.round, runId: r.runId }, select: { id: true, round: true } });
            await tx.notification.createMany({
                data: r.userIds.map((userId) => ({ userId, kind: 'review', title: `Review round ${r.round} started on ${r.ref}`, body: r.reason, link: null })),
            });
            return run;
        });
    }

    async setRunStatus(runId: string, status: 'running' | 'failed', error: string | null) {
        return prisma.$transaction(async (tx) =>
            tx.reviewRun.updateMany({ where: { runId, status: 'queued' }, data: { status, error, ...(status === 'failed' ? { finishedAt: new Date() } : {}) } }),
        );
    }
}
