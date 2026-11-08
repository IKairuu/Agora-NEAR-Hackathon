import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobRef = { id: string } | { ref: string } | { onchainId: bigint };

type Tx = Prisma.TransactionClient;

export interface ChainTxInput {
    txHash: string;
    signer: string;
    method: string;
    args: Prisma.InputJsonValue;
    ok: boolean;
    error: string | null;
    jobKey: JobRef | null;
}

const today = (): Date => new Date(new Date().toISOString().slice(0, 10));

const MONEY_TX = { timeout: 20_000, maxWait: 10_000 };

const sameDay = (a: Date | null): boolean => a !== null && a.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

@Injectable()
export class IndexerRepository {
    async recordTx(t: ChainTxInput) {
        return prisma.$transaction(async (tx) => {
            const owner = await tx.profile.findFirst({
                where: { OR: [{ nearAccountId: t.signer }, { agentsAccountId: t.signer }] },
                select: { id: true },
            });
            const job = t.jobKey ? await tx.job.findFirst({ where: t.jobKey, select: { id: true } }) : null;
            return tx.chainTx.upsert({
                where: { txHash: t.txHash },
                create: {
                    txHash: t.txHash, signerAccount: t.signer, method: t.method, args: t.args, status: t.ok ? 'success' : 'rejected',
                    error: t.error, ownerId: owner?.id ?? null, jobId: job?.id ?? null,
                },
                update: {},
                select: { id: true },
            });
        });
    }

    async fundJob(key: JobRef, txHash: string, startBalance: number) {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: key,
                select: { id: true, status: true, agreedPrice: true, buyerId: true, buyer: { select: { nearAccountId: true } } },
            });
            if (!job || job.status !== 'agreed' || job.agreedPrice === null) return null;
            const moved = await tx.job.updateMany({ where: { id: job.id, status: 'agreed' }, data: { status: 'funded' } });
            if (moved.count === 0) return null;
            const amount = job.agreedPrice;
            await tx.milestone.upsert({
                where: { jobId_idx: { jobId: job.id, idx: 0 } },
                create: { jobId: job.id, idx: 0, amount, status: 'funded', fundedTx: txHash, fundedAt: new Date() },
                update: { amount, status: 'funded', fundedTx: txHash, fundedAt: new Date() },
            });
            if (job.buyer.nearAccountId) await this.escrow(tx, job.buyer.nearAccountId, job.buyerId, amount, startBalance);
            return { jobId: job.id, amount: Number(amount) };
        }, MONEY_TX);
    }

    async releaseJob(key: JobRef, txHash: string, feeBps: number, daoAccount: string) {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: key,
                select: {
                    id: true, ref: true, status: true, buyerId: true, sellerId: true,
                    buyer: { select: { nearAccountId: true } },
                    seller: { select: { id: true, nearAccountId: true, ownerId: true } },
                    milestones: { where: { idx: 0 }, select: { id: true, amount: true, status: true } },
                },
            });
            const milestone = job?.milestones[0];
            if (!job || !job.seller || !milestone || ['released', 'refunded'].includes(milestone.status)) return null;
            const moved = await tx.job.updateMany({ where: { id: job.id, status: { in: ['funded', 'in_progress', 'delivered', 'reviewed'] } }, data: { status: 'released' } });
            if (moved.count === 0) return null;
            const amount = milestone.amount;
            const fee = amount.mul(feeBps).div(10_000);
            const payout = amount.sub(fee);
            await tx.milestone.update({
                where: { id: milestone.id },
                data: { status: 'released', releasedTx: txHash, releasedAt: new Date(), releaseReason: 'two_approvals' },
                select: { id: true },
            });
            if (job.buyer.nearAccountId) {
                await tx.balance.updateMany({ where: { accountId: job.buyer.nearAccountId }, data: { escrowed: { decrement: amount } } });
            }
            await this.credit(tx, job.seller.nearAccountId, job.seller.ownerId, payout);
            await this.credit(tx, daoAccount, null, fee);
            await tx.completionRecord.upsert({
                where: { tokenId: `agora-${job.ref}` },
                create: { tokenId: `agora-${job.ref}`, jobId: job.id, sellerId: job.seller.id, amount: payout, mintTx: txHash, mintedAt: new Date() },
                update: {},
            });
            await this.syncReputation(tx, job.seller.id, job.seller.nearAccountId);
            return { jobId: job.id, payout: Number(payout), fee: Number(fee), sellerOwnerId: job.seller.ownerId, buyerId: job.buyerId, ref: job.ref };
        }, MONEY_TX);
    }

    async refundJob(key: JobRef, txHash: string) {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: key,
                select: {
                    id: true, buyerId: true, buyer: { select: { nearAccountId: true } }, seller: { select: { id: true, nearAccountId: true } },
                    milestones: { where: { idx: 0 }, select: { id: true, amount: true, status: true } },
                },
            });
            const milestone = job?.milestones[0];
            if (!job || !milestone || ['released', 'refunded'].includes(milestone.status)) return null;
            await tx.job.update({ where: { id: job.id }, data: { status: 'refunded' }, select: { id: true } });
            await tx.milestone.update({ where: { id: milestone.id }, data: { status: 'refunded', releasedTx: txHash, releasedAt: new Date() }, select: { id: true } });
            if (job.buyer.nearAccountId) {
                await tx.balance.updateMany({
                    where: { accountId: job.buyer.nearAccountId },
                    data: { escrowed: { decrement: milestone.amount }, available: { increment: milestone.amount } },
                });
            }
            if (job.seller) await this.syncReputation(tx, job.seller.id, job.seller.nearAccountId);
            return { jobId: job.id, amount: Number(milestone.amount) };
        }, MONEY_TX);
    }

    private async escrow(tx: Tx, accountId: string, profileId: string, amount: Prisma.Decimal, startBalance: number) {
        const row = await tx.balance.findUnique({ where: { accountId }, select: { available: true, spentToday: true, dayStarted: true } });
        const spent = row && sameDay(row.dayStarted) ? row.spentToday.add(amount) : amount;
        await tx.balance.upsert({
            where: { accountId },
            create: { accountId, profileId, available: new Prisma.Decimal(startBalance).sub(amount), escrowed: amount, spentToday: amount, dayStarted: today(), syncedAt: new Date() },
            update: { available: { decrement: amount }, escrowed: { increment: amount }, spentToday: spent, dayStarted: today(), syncedAt: new Date() },
        });
    }

    private async credit(tx: Tx, accountId: string, profileId: string | null, amount: Prisma.Decimal) {
        await tx.balance.upsert({
            where: { accountId },
            create: { accountId, profileId, available: amount, syncedAt: new Date() },
            update: { available: { increment: amount }, syncedAt: new Date() },
        });
    }

    private async syncReputation(tx: Tx, sellerId: string, accountId: string) {
        const jobs = await tx.job.findMany({
            where: { sellerId, status: { in: ['released', 'settled', 'refunded', 'disputed'] } },
            select: { status: true, buyerId: true, milestones: { where: { status: 'released' }, select: { amount: true } } },
        });
        const settled = jobs.filter((j) => ['released', 'settled'].includes(j.status));
        const volume = settled.reduce((sum, j) => j.milestones.reduce((s, m) => s.add(m.amount), sum), new Prisma.Decimal(0));
        const approved = await tx.delivery.findMany({ where: { sellerId, status: 'approved' }, select: { attempt: true } });
        const firstTry = approved.length ? (approved.filter((d) => d.attempt === 1).length * 100) / approved.length : null;
        const data = {
            settledJobs: settled.length,
            refundedJobs: jobs.filter((j) => j.status === 'refunded').length,
            disputedJobs: jobs.filter((j) => j.status === 'disputed').length,
            settledVolume: volume,
            distinctBuyers: new Set(settled.map((j) => j.buyerId)).size,
            firstTryPassRate: firstTry === null ? null : new Prisma.Decimal(firstTry.toFixed(2)),
            syncedAt: new Date(),
        };
        await tx.reputation.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
    }
}
