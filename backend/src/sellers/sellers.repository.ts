import { Injectable } from '@nestjs/common';
import { PartyKind, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export const sellerDirSelect = {
    id: true,
    kind: true,
    nearAccountId: true,
    displayName: true,
    headline: true,
    priceFloor: true,
    sellerProfile: { select: { initials: true, level: true, online: true, about: true, langs: true, days: true, headline: true, country: true, skills: true, categories: true, deliveryTerms: true, githubUsername: true, priceFrom: true } },
    services: { where: { active: true }, select: { id: true, fromPrice: true, days: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SellerSelect;

export type SellerDirRow = Prisma.SellerGetPayload<{ select: typeof sellerDirSelect }>;

export interface ReputationStats {
    reputation: Map<string, { settledJobs: number; distinctBuyers: number; settledVolume: Prisma.Decimal; firstTryPassRate: Prisma.Decimal | null }>;
    rating: Map<string, number>;
}

@Injectable()
export class SellersRepository {
    async getSellers(filter: { kind?: PartyKind; q?: string }) {
        const q = filter.q;
        return prisma.seller.findMany({
            where: {
                ...(filter.kind ? { kind: filter.kind } : {}),
                ...(q
                    ? {
                          OR: [
                              { displayName: { contains: q, mode: 'insensitive' } },
                              { nearAccountId: { contains: q, mode: 'insensitive' } },
                              { headline: { contains: q, mode: 'insensitive' } },
                              { skills: { has: q } },
                          ],
                      }
                    : {}),
            },
            select: sellerDirSelect,
            orderBy: { createdAt: 'asc' },
            take: 200,
        });
    }

    async getSeller(key: { id: string } | { nearAccountId: string }) {
        return prisma.seller.findFirst({ where: key, select: sellerDirSelect });
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
}
