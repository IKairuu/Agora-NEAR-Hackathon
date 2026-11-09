import { Injectable } from '@nestjs/common';
import { GigTone, Prisma, ThumbKind } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export const gigSelect = {
    id: true,
    title: true,
    thumb: true,
    tone: true,
    category: true,
    fromPrice: true,
    days: true,
    prompt: true,
    active: true,
    seller: {
        select: {
            id: true,
            kind: true,
            nearAccountId: true,
            displayName: true,
            sellerProfile: { select: { initials: true, level: true, online: true } },
        },
    },
} satisfies Prisma.ServiceSelect;

export type GigRow = Prisma.ServiceGetPayload<{ select: typeof gigSelect }>;

export interface SellerStats {
    settled: Map<string, number>;
    rating: Map<string, number>;
}

export interface ServiceData {
    title: string;
    thumb: ThumbKind;
    tone: GigTone;
    category: string;
    fromPrice: number;
    days: number;
    prompt: string;
    active: boolean;
}

const WRITE_TX = { timeout: 20_000, maxWait: 10_000 };

@Injectable()
export class ServicesRepository {
    async getServices(filter: { category?: string; q?: string }) {
        const q = filter.q;
        return prisma.service.findMany({
            where: {
                active: true,
                ...(filter.category ? { category: filter.category } : {}),
                ...(q
                    ? {
                          OR: [
                              { title: { contains: q, mode: 'insensitive' } },
                              { prompt: { contains: q, mode: 'insensitive' } },
                              { seller: { displayName: { contains: q, mode: 'insensitive' } } },
                          ],
                      }
                    : {}),
            },
            select: gigSelect,
            orderBy: { createdAt: 'asc' },
            take: 200,
        });
    }

    async getService(id: string) {
        return prisma.service.findFirst({ where: { id, active: true }, select: gigSelect });
    }

    async getStats(accounts: string[]): Promise<SellerStats> {
        if (!accounts.length) return { settled: new Map(), rating: new Map() };
        const [reps, ratings] = await Promise.all([
            prisma.reputation.findMany({ where: { accountId: { in: accounts } }, select: { accountId: true, settledJobs: true } }),
            prisma.rating.groupBy({ by: ['rateeAccount'], where: { rateeAccount: { in: accounts } }, _avg: { stars: true } }),
        ]);
        return {
            settled: new Map(reps.map((r) => [r.accountId, r.settledJobs])),
            rating: new Map(ratings.map((r) => [r.rateeAccount, Math.round((r._avg.stars ?? 0) * 10) / 10])),
        };
    }

    async getOwnSeller(userId: string) {
        const profile = await prisma.sellerProfile.findUnique({ where: { userId }, select: { sellerId: true } });
        return prisma.seller.findFirst({
            where: { ownerId: userId, ...(profile?.sellerId ? { id: profile.sellerId } : {}) },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getOwnServices(userId: string) {
        return prisma.service.findMany({ where: { userId }, select: gigSelect, orderBy: { createdAt: 'asc' } });
    }

    async createServices(userId: string, sellerId: string, items: ServiceData[]) {
        return prisma.$transaction(async (tx) => {
            const created: { id: string }[] = [];
            for (const item of items) {
                created.push(await tx.service.create({ data: { userId, sellerId, ...item }, select: { id: true } }));
            }
            return created;
        }, WRITE_TX);
    }

    async editService(userId: string, id: string, data: ServiceData) {
        return prisma.$transaction(async (tx) => tx.service.updateMany({ where: { id, userId }, data }), WRITE_TX);
    }

    async deleteService(userId: string, id: string) {
        return prisma.$transaction(async (tx) => tx.service.updateMany({ where: { id, userId }, data: { active: false } }), WRITE_TX);
    }
}
