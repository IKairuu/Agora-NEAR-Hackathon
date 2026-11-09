import { Injectable } from '@nestjs/common';
import { Prisma, SavedKind } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';
import { ReputationStats, sellerDirSelect } from '../sellers/sellers.repository.js';
import { gigSelect } from '../services/services.repository.js';

const savedSelect = {
    id: true,
    kind: true,
    serviceId: true,
    sellerId: true,
    createdAt: true,
    service: { select: gigSelect },
    seller: { select: sellerDirSelect },
} satisfies Prisma.SavedItemSelect;

export type SavedRow = Prisma.SavedItemGetPayload<{ select: typeof savedSelect }>;

const WRITE_TX = { timeout: 20_000, maxWait: 10_000 };

@Injectable()
export class SavedRepository {
    async getSaved(userId: string) {
        return prisma.savedItem.findMany({ where: { userId }, select: savedSelect, orderBy: { createdAt: 'desc' }, take: 200 });
    }

    async findService(id: string) {
        return prisma.service.findFirst({ where: { id, active: true }, select: { id: true } });
    }

    async findSeller(key: { id: string } | { nearAccountId: string }) {
        return prisma.seller.findFirst({ where: key, select: { id: true } });
    }

    async getStats(accounts: string[]): Promise<ReputationStats> {
        if (!accounts.length) return { reputation: new Map(), rating: new Map() };
        const [reps, ratings] = await Promise.all([
            prisma.reputation.findMany({
                where: { accountId: { in: accounts } },
                select: { accountId: true, settledJobs: true, distinctBuyers: true, settledVolume: true, firstTryPassRate: true },
            }),
            prisma.rating.groupBy({ by: ['rateeAccount'], where: { rateeAccount: { in: accounts } }, _avg: { stars: true } }),
        ]);
        return {
            reputation: new Map(reps.map((r) => [r.accountId, r])),
            rating: new Map(ratings.map((r) => [r.rateeAccount, Math.round((r._avg.stars ?? 0) * 10) / 10])),
        };
    }

    async createSaved(userId: string, kind: SavedKind, targetId: string) {
        return prisma.$transaction(async (tx) => {
            await tx.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {}, select: { id: true } });
            const target = kind === 'service' ? { serviceId: targetId } : { sellerId: targetId };
            const existing = await tx.savedItem.findFirst({ where: { userId, ...target }, select: { id: true } });
            if (existing) return existing;
            return tx.savedItem.create({ data: { userId, kind, ...target }, select: { id: true } });
        }, WRITE_TX);
    }

    async deleteSaved(userId: string, id: string) {
        return prisma.$transaction(async (tx) => tx.savedItem.deleteMany({ where: { userId, OR: [{ id }, { serviceId: id }, { sellerId: id }] } }), WRITE_TX);
    }
}
