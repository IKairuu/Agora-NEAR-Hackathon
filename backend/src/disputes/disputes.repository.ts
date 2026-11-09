import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const twoSided = (userId: string): Prisma.JobWhereInput => ({ OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] });

const disputeSelect = {
    id: true,
    status: true,
    reason: true,
    openedBy: true,
    openedAt: true,
    recheckOutcome: true,
    recheckAt: true,
    escalatedBy: true,
    escalatorAccount: true,
    escalatedAt: true,
    claim: true,
    bondAmount: true,
    bondTx: true,
    daoProposalId: true,
    ruling: true,
    sellerAmount: true,
    buyerAmount: true,
    sellerShareBps: true,
    resolvedBy: true,
    resolveTx: true,
    resolvedAt: true,
    bondReturned: true,
} satisfies Prisma.DisputeSelect;

const jobSelect = {
    id: true,
    ref: true,
    title: true,
    onchainId: true,
    status: true,
    baseCommit: true,
    agreedPrice: true,
    buyerId: true,
    buyer: { select: { displayName: true, nearAccountId: true } },
    seller: { select: { displayName: true, nearAccountId: true, ownerId: true } },
    acceptanceSpecs: {
        where: { lockedAt: { not: null } },
        select: { testCommand: true, buildCommand: true, failingTests: true, allowedPaths: true, testFiles: true },
        orderBy: { version: 'desc' },
        take: 1,
    },
    milestones: {
        where: { idx: 0 },
        select: {
            id: true,
            amount: true,
            disputes: { select: disputeSelect, orderBy: { openedAt: 'desc' }, take: 1 },
            deliveries: {
                select: { id: true, commitSha: true, repoUrl: true, reviewRuns: { select: { round: true }, orderBy: { round: 'desc' }, take: 1 } },
                orderBy: { attempt: 'desc' },
                take: 1,
            },
        },
    },
} satisfies Prisma.JobSelect;

export type DisputeJob = Prisma.JobGetPayload<{ select: typeof jobSelect }>;

export interface NewRecheck {
    deliveryId: string;
    round: number;
    runId: string;
    userIds: string[];
    ref: string;
    reason: string;
}

export interface DisputeNote {
    userId: string;
    title: string;
    body: string | null;
}

@Injectable()
export class DisputesRepository {
    async getDisputeJob(userId: string, key: JobKey): Promise<DisputeJob | null> {
        return prisma.job.findFirst({ where: { ...key, ...twoSided(userId) }, select: jobSelect });
    }

    async getDisputeJobById(userId: string, disputeId: string): Promise<DisputeJob | null> {
        return prisma.job.findFirst({ where: { ...twoSided(userId), milestones: { some: { disputes: { some: { id: disputeId } } } } }, select: jobSelect });
    }

    async startRecheck(r: NewRecheck) {
        return prisma.$transaction(async (tx) => {
            const run = await tx.reviewRun.create({ data: { deliveryId: r.deliveryId, round: r.round, runId: r.runId }, select: { id: true, round: true } });
            await tx.notification.createMany({
                data: r.userIds.map((userId) => ({ userId, kind: 'dispute', title: `Dispute opened on ${r.ref}: free re-check, round ${r.round}`, body: r.reason, link: '/dispute' })),
            });
            return run;
        });
    }

    async setRunStatus(runId: string, status: 'running' | 'failed', error: string | null) {
        return prisma.$transaction(async (tx) =>
            tx.reviewRun.updateMany({ where: { runId, status: 'queued' }, data: { status, error, ...(status === 'failed' ? { finishedAt: new Date() } : {}) } }),
        );
    }

    async createNotes(notes: DisputeNote[]) {
        if (notes.length === 0) return 0;
        return prisma.$transaction(async (tx) => {
            const created = await tx.notification.createMany({ data: notes.map((n) => ({ ...n, kind: 'dispute', link: '/dispute' })) });
            return created.count;
        });
    }

    async getBalance(accountId: string) {
        return prisma.balance.findUnique({ where: { accountId }, select: { available: true, escrowed: true, syncedAt: true } });
    }
}
