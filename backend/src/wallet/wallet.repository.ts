import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

@Injectable()
export class WalletRepository {
    async getAccount(userId: string) {
        return prisma.profile.findFirst({ where: { id: userId }, select: { id: true, nearAccountId: true, agentsAccountId: true } });
    }

    async setAccountIds(userId: string, nearAccountId: string, agentsAccountId: string) {
        return prisma.$transaction(async (tx) =>
            tx.profile.update({ where: { id: userId }, data: { nearAccountId, agentsAccountId }, select: { id: true } }),
        );
    }

    async findAccountOwner(accountId: string, exceptUserId: string) {
        return prisma.profile.findFirst({
            where: { id: { not: exceptUserId }, OR: [{ nearAccountId: accountId }, { agentsAccountId: accountId }] },
            select: { id: true },
        });
    }

    async findProfileByAccount(accountId: string) {
        return prisma.profile.findFirst({ where: { nearAccountId: accountId }, select: { id: true } });
    }

    async createWalletProfile(userId: string, nearAccountId: string, agentsAccountId: string | null) {
        return prisma.$transaction(async (tx) =>
            tx.profile.upsert({
                where: { id: userId },
                create: { id: userId, displayName: nearAccountId, nearAccountId, agentsAccountId },
                update: { nearAccountId, agentsAccountId },
                select: { id: true },
            }),
        );
    }

    async getBalance(accountId: string) {
        return prisma.balance.findUnique({ where: { accountId }, select: { available: true, escrowed: true, spentToday: true, dayStarted: true } });
    }

    async getActivity(userId: string, accounts: string[]) {
        return prisma.chainTx.findMany({
            where: {
                OR: [
                    { ownerId: userId },
                    { signerAccount: { in: accounts } },
                    { method: 'vote', job: { seller: { ownerId: userId } } },
                    { method: { in: ['resolve_dispute', 'finalize_default'] }, job: { OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] } },
                ],
            },
            select: { id: true, method: true, args: true, txHash: true, status: true, error: true, createdAt: true, job: { select: { ref: true, agreedPrice: true } } },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
    }
}
