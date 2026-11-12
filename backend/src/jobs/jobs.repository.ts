import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const jobSelect = {
    id: true,
    ref: true,
    title: true,
    description: true,
    status: true,
    visibility: true,
    repoUrl: true,
    baseCommit: true,
    budgetLabel: true,
    agreedPrice: true,
    acceptedBidId: true,
    postedAt: true,
    createdAt: true,
    buyerId: true,
    categoryRef: { select: { slug: true, name: true } },
    seller: { select: { displayName: true, ownerId: true } },
    acceptanceSpecs: { select: { specHash: true, lockedAt: true }, orderBy: { version: 'desc' }, take: 1 },
    _count: { select: { bids: true, completionRecords: true } },
} satisfies Prisma.JobSelect;

export type JobRow = Prisma.JobGetPayload<{ select: typeof jobSelect }>;

const readableJob = (userId: string): Prisma.JobWhereInput => ({
    OR: [
        { buyerId: userId },
        { seller: { ownerId: userId } },
        { visibility: 'public', status: { not: 'draft' } },
    ],
});

const openJobSelect = {
    ref: true,
    title: true,
    description: true,
    budgetLabel: true,
    postedAt: true,
    createdAt: true,
    categoryRef: { select: { slug: true, name: true } },
    buyer: { select: { displayName: true } },
    acceptanceSpecs: { where: { lockedAt: { not: null } }, select: { failingTests: true }, orderBy: { version: 'desc' }, take: 1 },
    _count: { select: { bids: true } },
} satisfies Prisma.JobSelect;

export type OpenJobRow = Prisma.JobGetPayload<{ select: typeof openJobSelect }>;

@Injectable()
export class JobsRepository {
    async getOpenJobs(filter: { category?: string; q?: string }) {
        return prisma.job.findMany({
            where: {
                visibility: 'public',
                status: { in: ['open', 'negotiating'] },
                ...(filter.category ? { category: filter.category } : {}),
                ...(filter.q ? { OR: [{ title: { contains: filter.q, mode: 'insensitive' } }, { description: { contains: filter.q, mode: 'insensitive' } }] } : {}),
            },
            orderBy: { postedAt: 'desc' },
            take: 100,
            select: openJobSelect,
        });
    }

    async getJobs(userId: string) {
        return prisma.job.findMany({
            where: { buyerId: userId },
            orderBy: { createdAt: 'desc' },
            select: jobSelect,
        });
    }

    async getJob(userId: string, job: JobKey) {
        return prisma.job.findFirst({
            where: { ...job, ...readableJob(userId) },
            select: jobSelect,
        });
    }

    async getOwnedJob(userId: string, job: JobKey) {
        return prisma.job.findFirst({
            where: { ...job, buyerId: userId },
            select: jobSelect,
        });
    }

    async getPostContext(userId: string, id: string) {
        return prisma.job.findFirst({
            where: { id, buyerId: userId },
            select: {
                id: true, ref: true, category: true, onchainId: true, postedTx: true, budgetLabel: true, budgetMaxPublic: true,
                buyer: { select: { nearAccountId: true, agentsAccountId: true } },
                acceptanceSpecs: { where: { lockedAt: { not: null } }, select: { specHash: true }, orderBy: { version: 'desc' }, take: 1 },
            },
        });
    }

    async setBuyerAccounts(userId: string, nearAccountId: string, agentsAccountId: string) {
        return prisma.$transaction(async (tx) =>
            tx.profile.update({ where: { id: userId }, data: { nearAccountId, agentsAccountId }, select: { id: true } }),
        );
    }

    async setOnchainJob(userId: string, id: string, onchainId: bigint, txHash: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.job.updateMany({ where: { id, buyerId: userId, onchainId: null }, data: { onchainId, postedTx: txHash } });
            await tx.chainTx.updateMany({ where: { txHash, jobId: null }, data: { jobId: id } });
            return updated.count;
        });
    }

    /** Deletes the buyer's own draft. The status is part of the filter, so a job posted meanwhile is left alone. */
    async deleteDraft(userId: string, id: string) {
        return prisma.$transaction(async (tx) => {
            const deleted = await tx.job.deleteMany({ where: { id, buyerId: userId, status: 'draft' } });
            return deleted.count;
        });
    }

    /**
     * Cancels the buyer's own open job before any offer is accepted. A hire offer still waiting for the seller is
     * declined in the same transaction, so a seller accepting at the same moment either wins (the job is agreed and
     * this changes nothing) or finds the offer declined.
     */
    async cancelJob(userId: string, id: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.job.updateMany({
                where: { id, buyerId: userId, status: { in: ['open', 'negotiating'] }, acceptedBidId: null },
                data: { status: 'cancelled' },
            });
            if (updated.count === 0) return 0;
            await tx.hireOffer.updateMany({ where: { jobId: id, status: 'sent' }, data: { status: 'declined' } });
            await tx.bid.updateMany({ where: { jobId: id, status: { in: ['pending_check', 'live', 'held', 'shortlisted'] } }, data: { status: 'rejected' } });
            return updated.count;
        });
    }

    async publishJob(userId: string, id: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.job.updateMany({
                where: { id, buyerId: userId, status: { in: ['draft', 'open'] } },
                data: { status: 'open', visibility: 'public', postedAt: new Date() },
            });
            return updated.count;
        });
    }
}
