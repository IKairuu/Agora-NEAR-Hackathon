import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

@Injectable()
export class MandatesRepository {
    async getMandate(userId: string) {
        return prisma.profile.findFirst({
            where: { id: userId },
            select: {
                nearAccountId: true,
                agentsAccountId: true,
                mandate: {
                    select: {
                        perJobCap: true, dailyCap: true, newSellerCap: true, reviewWindowHours: true, allowedCategories: true, strictSellers: true,
                        paused: true, pausedBy: true, pausedAt: true, lastTxHash: true, syncedAt: true,
                    },
                },
                approvedSellers: { select: { seller: { select: { id: true, displayName: true, nearAccountId: true } } } },
            },
        });
    }

    async getBalance(accountId: string) {
        return prisma.balance.findUnique({ where: { accountId }, select: { spentToday: true, dayStarted: true } });
    }

    async findCategories(slugs: string[]) {
        const rows = await prisma.category.findMany({ where: { slug: { in: slugs }, enabled: true }, select: { slug: true } });
        return rows.map((r) => r.slug);
    }

    async findSellers(accounts: string[]) {
        const rows = await prisma.seller.findMany({ where: { nearAccountId: { in: accounts } }, select: { nearAccountId: true } });
        return rows.map((r) => r.nearAccountId);
    }

    async setAccountIds(userId: string, nearAccountId: string, agentsAccountId: string) {
        return prisma.$transaction(async (tx) =>
            tx.profile.update({ where: { id: userId }, data: { nearAccountId, agentsAccountId }, select: { id: true } }),
        );
    }
}
