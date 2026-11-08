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
    postedAt: true,
    createdAt: true,
    buyerId: true,
    categoryRef: { select: { slug: true, name: true } },
    seller: { select: { displayName: true, ownerId: true } },
    acceptanceSpecs: { select: { specHash: true, lockedAt: true }, orderBy: { version: 'desc' }, take: 1 },
    _count: { select: { bids: true } },
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
