import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const ratingSelect = { stars: true, comment: true, ratingTx: true, createdAt: true, job: { select: { ref: true, title: true } } } as const;

@Injectable()
export class ReputationRepository {
    async getReputation(accountId: string) {
        const [rep, records, stats, ratings] = await Promise.all([
            prisma.reputation.findUnique({
                where: { accountId },
                select: { settledJobs: true, refundedJobs: true, disputedJobs: true, settledVolume: true, distinctBuyers: true, firstTryPassRate: true, syncedAt: true },
            }),
            prisma.completionRecord.findMany({
                where: { seller: { nearAccountId: accountId } },
                select: { tokenId: true, amount: true, mintTx: true, mintedAt: true, job: { select: { ref: true, title: true } } },
                orderBy: { mintedAt: 'desc' },
                take: 20,
            }),
            prisma.rating.aggregate({ where: { rateeAccount: accountId }, _avg: { stars: true }, _count: { _all: true } }),
            prisma.rating.findMany({ where: { rateeAccount: accountId }, select: ratingSelect, orderBy: { createdAt: 'desc' }, take: 5 }),
        ]);
        return { rep, records, stats, ratings };
    }

    async getRatings(accountId: string) {
        return prisma.rating.findMany({ where: { rateeAccount: accountId }, select: ratingSelect, orderBy: { createdAt: 'desc' }, take: 50 });
    }

    async getRatingTarget(userId: string, key: JobKey) {
        return prisma.job.findFirst({
            where: { ...key, OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] },
            select: {
                id: true, ref: true, status: true, buyerId: true,
                buyer: { select: { nearAccountId: true } },
                seller: { select: { ownerId: true, nearAccountId: true } },
                ratings: { where: { raterId: userId }, select: { id: true } },
            },
        });
    }

    async createRating(data: { jobId: string; raterId: string; rateeAccount: string; rateeUserId: string; stars: number; comment: string | null; ratingTx: string; ref: string }) {
        return prisma.$transaction(async (tx) => {
            const row = await tx.rating.create({
                data: { jobId: data.jobId, raterId: data.raterId, rateeAccount: data.rateeAccount, stars: data.stars, comment: data.comment, ratingTx: data.ratingTx },
                select: { id: true },
            });
            await tx.notification.create({
                data: { userId: data.rateeUserId, kind: 'rating', title: `You got ${data.stars} star${data.stars === 1 ? '' : 's'} on ${data.ref}`, body: data.comment, link: null },
            });
            return row;
        });
    }
}
