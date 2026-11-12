import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

export const DELIVERABLE_STATUSES = ['funded', 'in_progress'] as const;

const deliverySelect = {
    id: true,
    attempt: true,
    commitSha: true,
    repoUrl: true,
    status: true,
    verdict: true,
    reason: true,
    filesTouched: true,
    diffStats: true,
    submitTx: true,
    createdAt: true,
    milestone: { select: { idx: true } },
    votes: { select: { approve: true } },
    reviewRuns: {
        select: { runId: true, round: true, status: true, exitCode: true, installExit: true, baselineExitCode: true, scopeOk: true, error: true, durationMs: true },
        orderBy: { round: 'desc' },
        take: 1,
    },
} satisfies Prisma.DeliverySelect;

export type DeliveryRow = Prisma.DeliveryGetPayload<{ select: typeof deliverySelect }>;

const proofSelect = {
    ...deliverySelect,
    milestone: { select: { idx: true, job: { select: { ref: true, title: true, buyerId: true, baseCommit: true, seller: { select: { ownerId: true, nearAccountId: true } } } } } },
    votes: {
        select: { approve: true, checkResults: true, logHash: true, logPath: true, attestationHash: true, model: true, voteTx: true, createdAt: true, reviewerAgent: { select: { label: true } } },
        orderBy: { createdAt: 'asc' },
    },
    reviewRuns: {
        select: {
            runId: true, round: true, status: true, exitCode: true, installExit: true, baselineExitCode: true, scopeOk: true,
            changedFiles: true, logHash: true, logPath: true, durationMs: true, error: true, result: true, startedAt: true, finishedAt: true,
        },
        orderBy: { round: 'asc' },
    },
} satisfies Prisma.DeliverySelect;

export type ProofRow = Prisma.DeliveryGetPayload<{ select: typeof proofSelect }>;

export interface NewDelivery {
    jobId: string;
    milestoneId: string;
    sellerId: string;
    attempt: number;
    commitSha: string;
    repoUrl: string;
    submitTx: string;
    runId: string;
    buyerId: string;
    title: string;
}

const twoSided = (userId: string): Prisma.JobWhereInput => ({ OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] });

@Injectable()
export class DeliveriesRepository {
    async getJobForDelivery(key: JobKey, idx: number) {
        return prisma.job.findFirst({
            where: key,
            select: {
                id: true, ref: true, title: true, status: true, buyerId: true, repoUrl: true, baseCommit: true, onchainId: true,
                seller: { select: { id: true, ownerId: true, nearAccountId: true } },
                milestones: {
                    where: { idx },
                    select: {
                        id: true, status: true,
                        deliveries: { select: { attempt: true, status: true }, orderBy: { attempt: 'desc' }, take: 1 },
                    },
                },
                acceptanceSpecs: {
                    where: { lockedAt: { not: null } },
                    select: { testCommand: true, buildCommand: true, failingTests: true, allowedPaths: true, testFiles: true, holdoutHash: true, holdout: { select: { holdoutHash: true, ciphertext: true } } },
                    orderBy: { version: 'desc' },
                    take: 1,
                },
            },
        });
    }

    async extraAttempts(jobId: string) {
        return prisma.chainTx.count({ where: { jobId, method: 'grant_attempt', status: 'success' } });
    }

    async createDelivery(d: NewDelivery) {
        return prisma.$transaction(async (tx) => {
            const delivery = await tx.delivery.create({
                data: { milestoneId: d.milestoneId, sellerId: d.sellerId, attempt: d.attempt, commitSha: d.commitSha, repoUrl: d.repoUrl, submitTx: d.submitTx },
                select: { id: true, attempt: true },
            });
            await tx.reviewRun.create({ data: { deliveryId: delivery.id, round: 1, runId: d.runId }, select: { id: true } });
            await tx.milestone.update({ where: { id: d.milestoneId }, data: { status: 'delivered' }, select: { id: true } });
            await tx.job.updateMany({ where: { id: d.jobId, status: { in: [...DELIVERABLE_STATUSES] } }, data: { status: 'delivered' } });
            await tx.notification.create({
                data: { userId: d.buyerId, kind: 'delivery', title: `Delivery ${d.attempt} received`, body: `${d.title}: commit ${d.commitSha.slice(0, 7)}. The locked tests are running.`, link: null },
            });
            return delivery;
        });
    }

    async setRunStatus(runId: string, status: 'running' | 'failed', error: string | null) {
        return prisma.$transaction(async (tx) =>
            tx.reviewRun.updateMany({ where: { runId, status: 'queued' }, data: { status, error, ...(status === 'failed' ? { finishedAt: new Date() } : {}) } }),
        );
    }

    async listDeliveries(userId: string, key: JobKey) {
        return prisma.delivery.findMany({
            where: { milestone: { job: { ...key, ...twoSided(userId) } } },
            select: deliverySelect,
            orderBy: [{ milestone: { idx: 'asc' } }, { attempt: 'asc' }],
        });
    }

    async isParty(userId: string, key: JobKey) {
        const job = await prisma.job.findFirst({ where: { ...key, ...twoSided(userId) }, select: { id: true } });
        return job !== null;
    }

    async getProof(userId: string, id: string) {
        return prisma.delivery.findFirst({
            where: { id, milestone: { job: twoSided(userId) } },
            select: proofSelect,
        });
    }
}
