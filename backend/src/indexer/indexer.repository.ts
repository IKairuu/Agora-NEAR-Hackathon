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

export const MANDATE_DEFAULTS = {
    perJobCap: 50,
    dailyCap: 120,
    newSellerCap: 25,
    reviewWindowHours: 12,
    allowedCategories: ['rust', 'fe', 'tests'],
    strictSellers: false,
};

export interface MandateInput {
    perJobCap: number;
    dailyCap: number;
    newSellerCap: number;
    reviewWindowHours: number;
    allowedCategories: string[];
    strictSellers: boolean;
}

const sameDay = (a: Date | null): boolean => a !== null && a.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

const disputeContextSelect = {
    id: true,
    status: true,
    agreedPrice: true,
    buyerId: true,
    buyer: { select: { nearAccountId: true } },
    seller: { select: { id: true, nearAccountId: true, ownerId: true } },
    milestones: {
        where: { idx: 0 },
        select: {
            id: true,
            amount: true,
            _count: { select: { deliveries: true } },
            disputes: {
                select: { id: true, status: true, recheckOutcome: true, recheckAt: true, escalatedAt: true, claim: true, bondAmount: true },
                orderBy: { openedAt: 'desc' },
                take: 1,
            },
        },
    },
} satisfies Prisma.JobSelect;

export type DisputeContext = Prisma.JobGetPayload<{ select: typeof disputeContextSelect }>;

export interface Escalation {
    signer: string;
    party: 'buyer' | 'seller';
    claim: 'release' | 'refund';
    bond: number;
    txHash: string;
    at: Date;
    startBalance: number;
}

export interface Settlement {
    outcome: 'release' | 'refund' | 'split';
    sellerShareBps: number;
    by: 'dao' | 'default';
    txHash: string;
    at: Date;
    sellerAmount: Prisma.Decimal;
    buyerAmount: Prisma.Decimal;
    fee: Prisma.Decimal;
    daoAccount: string;
}

export const bondReturnedFor = (bond: Prisma.Decimal | null, claim: string | null, outcome: string, by: 'dao' | 'default', escalator: string | null): boolean =>
    bond !== null && bond.gt(0) && by === 'dao' && escalator !== null && (claim === outcome || outcome === 'split');

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
        }, MONEY_TX);
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

    async refundJob(key: JobRef, txHash: string, finalStatus: 'refunded' | 'expired' = 'refunded') {
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
            await tx.job.update({ where: { id: job.id }, data: { status: finalStatus }, select: { id: true } });
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

    async getRefundContext(key: JobRef) {
        const job = await prisma.job.findFirst({
            where: key,
            select: {
                id: true, status: true,
                buyer: { select: { nearAccountId: true } },
                acceptedBid: { select: { deliveryDays: true } },
                milestones: {
                    where: { idx: 0 },
                    select: { status: true, fundedAt: true, deliveries: { select: { attempt: true, status: true }, orderBy: { attempt: 'desc' }, take: 1 } },
                },
            },
        });
        if (!job) return null;
        const extraAttempts = await prisma.chainTx.count({ where: { jobId: job.id, method: 'grant_attempt', status: 'success' } });
        const milestone = job.milestones[0] ?? null;
        return {
            id: job.id,
            status: job.status,
            buyerAccount: job.buyer.nearAccountId,
            milestoneStatus: milestone?.status ?? null,
            fundedAt: milestone?.fundedAt ?? null,
            deliveryDays: job.acceptedBid?.deliveryDays ?? null,
            lastAttempt: milestone?.deliveries[0]?.attempt ?? 0,
            lastDeliveryStatus: milestone?.deliveries[0]?.status ?? null,
            extraAttempts,
        };
    }

    async countExtraAttempts(jobId: string) {
        return prisma.chainTx.count({ where: { jobId, method: 'grant_attempt', status: 'success' } });
    }

    async getDisputeContext(key: JobRef): Promise<DisputeContext | null> {
        return prisma.job.findFirst({ where: key, select: disputeContextSelect });
    }

    async openDispute(key: JobRef, party: 'buyer' | 'seller', reason: string, at: Date) {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: key,
                select: {
                    id: true, buyerId: true, seller: { select: { id: true, nearAccountId: true, ownerId: true } },
                    milestones: { where: { idx: 0 }, select: { id: true, deliveries: { select: { id: true }, orderBy: { attempt: 'desc' }, take: 1 } } },
                },
            });
            const milestone = job?.milestones[0];
            if (!job || !job.seller || !milestone) return null;
            const existing = await tx.dispute.findFirst({ where: { milestoneId: milestone.id }, select: { id: true } });
            if (existing) return null;
            const moved = await tx.job.updateMany({ where: { id: job.id, status: { in: ['delivered', 'reviewed', 'in_progress', 'funded'] } }, data: { status: 'disputed' } });
            if (moved.count === 0) return null;
            await tx.milestone.update({ where: { id: milestone.id }, data: { status: 'disputed' }, select: { id: true } });
            const dispute = await tx.dispute.create({
                data: { milestoneId: milestone.id, openedBy: party === 'buyer' ? job.buyerId : job.seller.ownerId, reason, status: 'recheck', openedAt: at },
                select: { id: true },
            });
            const delivery = milestone.deliveries[0];
            if (delivery) {
                await tx.reviewerVote.deleteMany({ where: { deliveryId: delivery.id } });
                await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'reviewing' }, select: { id: true } });
            }
            await this.syncReputation(tx, job.seller.id, job.seller.nearAccountId);
            return { disputeId: dispute.id, jobId: job.id, deliveryId: delivery?.id ?? null };
        }, MONEY_TX);
    }

    async escalateDispute(key: JobRef, e: Escalation) {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({ where: key, select: { id: true, buyerId: true, seller: { select: { ownerId: true } } } });
            if (!job) return null;
            const dispute = await tx.dispute.findFirst({ where: { milestone: { jobId: job.id }, status: 'recheck', escalatedAt: null }, select: { id: true } });
            if (!dispute) return null;
            const bond = new Prisma.Decimal(e.bond);
            const row = await tx.balance.findUnique({ where: { accountId: e.signer }, select: { accountId: true } });
            if (row) {
                await tx.balance.update({ where: { accountId: e.signer }, data: { available: { decrement: bond }, syncedAt: e.at }, select: { accountId: true } });
            } else {
                const owner = await tx.profile.findFirst({ where: { OR: [{ nearAccountId: e.signer }, { agentsAccountId: e.signer }] }, select: { id: true } });
                await tx.balance.create({ data: { accountId: e.signer, profileId: owner?.id ?? null, available: new Prisma.Decimal(e.startBalance).sub(bond), syncedAt: e.at }, select: { accountId: true } });
            }
            await tx.dispute.update({
                where: { id: dispute.id },
                data: {
                    status: 'escalated', claim: e.claim, bondAmount: bond, bondTx: e.txHash, escalatedAt: e.at,
                    escalatedBy: e.party === 'buyer' ? job.buyerId : job.seller?.ownerId ?? null, escalatorAccount: e.signer,
                },
                select: { id: true },
            });
            return { disputeId: dispute.id, jobId: job.id, claim: e.claim, bond: e.bond };
        }, MONEY_TX);
    }

    async settleDispute(key: JobRef, s: Settlement) {
        return prisma.$transaction(async (tx) => {
            const job = await tx.job.findFirst({
                where: key,
                select: {
                    id: true, ref: true, buyerId: true, agreedPrice: true,
                    buyer: { select: { nearAccountId: true } },
                    seller: { select: { id: true, nearAccountId: true, ownerId: true } },
                    milestones: {
                        where: { idx: 0 },
                        select: {
                            id: true, amount: true,
                            disputes: { where: { status: { in: ['recheck', 'escalated'] } }, select: { id: true, claim: true, bondAmount: true, escalatorAccount: true, escalatedBy: true }, take: 1 },
                        },
                    },
                },
            });
            const milestone = job?.milestones[0];
            const dispute = milestone?.disputes[0];
            if (!job || !job.seller || !milestone || !dispute) return null;
            const moved = await tx.job.updateMany({ where: { id: job.id, status: 'disputed' }, data: { status: s.outcome === 'refund' ? 'refunded' : 'released' } });
            if (moved.count === 0) return null;
            const price = job.agreedPrice ?? milestone.amount;
            await tx.milestone.update({
                where: { id: milestone.id },
                data: {
                    status: s.outcome === 'release' ? 'released' : s.outcome === 'refund' ? 'refunded' : 'split',
                    releasedTx: s.txHash, releasedAt: s.at,
                    ...(s.outcome === 'refund' ? {} : { releaseReason: s.by === 'dao' ? 'dao_ruling' : 'two_approvals' }),
                },
                select: { id: true },
            });
            if (job.buyer.nearAccountId) {
                await tx.balance.updateMany({
                    where: { accountId: job.buyer.nearAccountId },
                    data: { escrowed: { decrement: price }, available: { increment: s.buyerAmount }, syncedAt: s.at },
                });
            }
            if (s.sellerAmount.gt(0)) await this.credit(tx, job.seller.nearAccountId, job.seller.ownerId, s.sellerAmount);
            if (s.fee.gt(0)) await this.credit(tx, s.daoAccount, null, s.fee);
            const bond = dispute.bondAmount ?? new Prisma.Decimal(0);
            const bondReturned = bondReturnedFor(bond, dispute.claim, s.outcome, s.by, dispute.escalatorAccount);
            if (bond.gt(0)) {
                await this.credit(tx, bondReturned ? dispute.escalatorAccount! : s.daoAccount, bondReturned ? dispute.escalatedBy : null, bond);
            }
            if (s.sellerAmount.gt(0)) {
                await tx.completionRecord.upsert({
                    where: { tokenId: `agora-${job.ref}` },
                    create: { tokenId: `agora-${job.ref}`, jobId: job.id, sellerId: job.seller.id, amount: s.sellerAmount, mintTx: s.txHash, mintedAt: s.at },
                    update: {},
                });
            }
            await tx.dispute.update({
                where: { id: dispute.id },
                data: {
                    status: 'resolved', ruling: s.outcome, sellerAmount: s.sellerAmount, buyerAmount: s.buyerAmount, sellerShareBps: s.sellerShareBps,
                    resolveTx: s.txHash, resolvedAt: s.at, resolvedBy: s.by, bondReturned,
                },
                select: { id: true },
            });
            await this.syncReputation(tx, job.seller.id, job.seller.nearAccountId);
            return {
                disputeId: dispute.id, jobId: job.id, outcome: s.outcome, sellerAmount: Number(s.sellerAmount), buyerAmount: Number(s.buyerAmount), fee: Number(s.fee),
                bond: Number(bond), bondReturned, buyerId: job.buyerId, sellerOwnerId: job.seller.ownerId, ref: job.ref,
            };
        }, MONEY_TX);
    }

    async getFundingContext(key: JobRef) {
        return prisma.job.findFirst({
            where: key,
            select: {
                id: true, status: true, category: true, agreedPrice: true, buyerId: true,
                buyer: {
                    select: {
                        nearAccountId: true,
                        mandate: { select: { perJobCap: true, dailyCap: true, newSellerCap: true, allowedCategories: true, strictSellers: true, paused: true } },
                        approvedSellers: { select: { sellerId: true } },
                    },
                },
                seller: { select: { id: true, nearAccountId: true, stake: true } },
                acceptedBid: { select: { fraudScore: true, priceCheck: true, ownerApprovedRisk: true } },
            },
        });
    }

    async getChainJob(key: JobRef) {
        return prisma.job.findFirst({
            where: key,
            select: { id: true, status: true, buyerId: true, buyer: { select: { nearAccountId: true } } },
        });
    }

    async getChainBid(key: { onchainId: bigint } | { id: string }) {
        return prisma.bid.findFirst({
            where: key,
            select: { id: true, jobId: true, price: true, seller: { select: { nearAccountId: true, ownerId: true } } },
        });
    }

    async isSeller(accountId: string) {
        const row = await prisma.seller.findUnique({ where: { nearAccountId: accountId }, select: { id: true } });
        return row !== null;
    }

    async countSuccessTxs(jobId: string, method: string, signer?: string) {
        return prisma.chainTx.count({ where: { jobId, method, status: 'success', ...(signer ? { signerAccount: signer } : {}) } });
    }

    async getRatingContext(key: JobRef) {
        return prisma.job.findFirst({
            where: key,
            select: {
                id: true, status: true, buyerId: true,
                buyer: { select: { nearAccountId: true } },
                seller: { select: { id: true, nearAccountId: true, ownerId: true } },
                ratings: { select: { raterId: true } },
            },
        });
    }

    async getStakeContext(accountId: string) {
        const [seller, rep] = await Promise.all([
            prisma.seller.findUnique({ where: { nearAccountId: accountId }, select: { id: true, stake: true } }),
            prisma.reputation.findUnique({ where: { accountId }, select: { settledJobs: true, disputedJobs: true } }),
        ]);
        return { seller, settled: rep?.settledJobs ?? 0, disputes: rep?.disputedJobs ?? 0 };
    }

    async addStake(accountId: string, amount: number, txHash: string, startBalance: number) {
        return prisma.$transaction(async (tx) => {
            const add = new Prisma.Decimal(amount);
            const row = await tx.balance.findUnique({ where: { accountId }, select: { accountId: true } });
            if (row) {
                await tx.balance.update({ where: { accountId }, data: { available: { decrement: add }, syncedAt: new Date() }, select: { accountId: true } });
            } else {
                const owner = await tx.profile.findFirst({ where: { OR: [{ nearAccountId: accountId }, { agentsAccountId: accountId }] }, select: { id: true } });
                await tx.balance.create({ data: { accountId, profileId: owner?.id ?? null, available: new Prisma.Decimal(startBalance).sub(add), syncedAt: new Date() }, select: { accountId: true } });
            }
            const seller = await tx.seller.update({ where: { nearAccountId: accountId }, data: { stake: { increment: add } }, select: { id: true, stake: true } });
            await tx.sellerProfile.updateMany({ where: { sellerId: seller.id }, data: { stakeTx: txHash } });
            return { sellerId: seller.id, stake: Number(seller.stake) };
        }, MONEY_TX);
    }

    async returnStake(accountId: string) {
        return prisma.$transaction(async (tx) => {
            const seller = await tx.seller.findUnique({ where: { nearAccountId: accountId }, select: { id: true, ownerId: true, stake: true } });
            if (!seller || seller.stake.lte(0)) return null;
            await tx.seller.update({ where: { id: seller.id }, data: { stake: 0 }, select: { id: true } });
            await tx.sellerProfile.updateMany({ where: { sellerId: seller.id }, data: { stakeTx: null } });
            await this.credit(tx, accountId, seller.ownerId, seller.stake);
            return { sellerId: seller.id, returned: Number(seller.stake) };
        }, MONEY_TX);
    }

    async hasTx(txHash: string): Promise<boolean> {
        return (await prisma.chainTx.count({ where: { txHash } })) > 0;
    }

    async syncBalance(accountId: string, free: number, escrowed: number) {
        return prisma.$transaction(async (tx) => {
            const owner = await tx.profile.findFirst({ where: { nearAccountId: accountId }, select: { id: true } });
            return tx.balance.upsert({
                where: { accountId },
                create: { accountId, profileId: owner?.id ?? null, available: free, escrowed, syncedAt: new Date() },
                update: { available: free, escrowed, syncedAt: new Date() },
                select: { accountId: true },
            });
        });
    }

    async getBalance(accountId: string) {
        return prisma.balance.findUnique({ where: { accountId }, select: { available: true, escrowed: true, spentToday: true, dayStarted: true } });
    }

    async getSettledJobs(accountId: string) {
        const rep = await prisma.reputation.findUnique({ where: { accountId }, select: { settledJobs: true } });
        return rep?.settledJobs ?? 0;
    }

    async findOwner(accountId: string) {
        return prisma.profile.findFirst({ where: { OR: [{ nearAccountId: accountId }, { agentsAccountId: accountId }] }, select: { id: true, nearAccountId: true } });
    }

    async deposit(accountId: string, profileId: string | null, amount: number, startBalance: number) {
        return prisma.$transaction(async (tx) => {
            const row = await tx.balance.findUnique({ where: { accountId }, select: { accountId: true } });
            const add = new Prisma.Decimal(amount);
            return tx.balance.upsert({
                where: { accountId },
                create: { accountId, profileId, available: row ? add : add.add(startBalance), syncedAt: new Date() },
                update: { available: { increment: add }, syncedAt: new Date() },
                select: { available: true, escrowed: true },
            });
        }, MONEY_TX);
    }

    async withdraw(accountId: string, amount: number) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.balance.updateMany({
                where: { accountId, available: { gte: amount } },
                data: { available: { decrement: amount }, syncedAt: new Date() },
            });
            return updated.count;
        }, MONEY_TX);
    }

    async setMandate(ownerId: string, m: MandateInput, approvedAccounts: string[], txHash: string) {
        return prisma.$transaction(async (tx) => {
            const data = { ...m, lastTxHash: txHash, syncedAt: new Date() };
            const row = await tx.mandate.upsert({ where: { ownerId }, create: { ownerId, ...data }, update: data, select: { ownerId: true } });
            const sellers = await tx.seller.findMany({ where: { nearAccountId: { in: approvedAccounts } }, select: { id: true } });
            await tx.approvedSeller.deleteMany({ where: { ownerId, sellerId: { notIn: sellers.map((x) => x.id) } } });
            for (const seller of sellers) {
                await tx.approvedSeller.upsert({
                    where: { ownerId_sellerId: { ownerId, sellerId: seller.id } },
                    create: { ownerId, sellerId: seller.id, addedTx: txHash, addedAt: new Date() },
                    update: {},
                });
            }
            return row;
        }, MONEY_TX);
    }

    async setPaused(ownerId: string, paused: boolean, by: string, txHash: string) {
        return prisma.$transaction(async (tx) => {
            const data = { paused, pausedBy: paused ? by : null, pausedAt: paused ? new Date() : null, lastTxHash: txHash, syncedAt: new Date() };
            return tx.mandate.upsert({
                where: { ownerId },
                create: { ownerId, ...MANDATE_DEFAULTS, ...data },
                update: data,
                select: { ownerId: true },
            });
        });
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
            select: {
                status: true, buyerId: true,
                milestones: { where: { status: { in: ['released', 'split'] } }, select: { amount: true, status: true, disputes: { where: { status: 'resolved' }, select: { sellerShareBps: true }, take: 1 } } },
            },
        });
        const disputes = await tx.dispute.count({ where: { milestone: { job: { sellerId } } } });
        const settled = jobs.filter((j) => ['released', 'settled'].includes(j.status));
        const share = (m: { amount: Prisma.Decimal; status: string; disputes: { sellerShareBps: number | null }[] }) =>
            m.status === 'split' ? m.amount.mul(m.disputes[0]?.sellerShareBps ?? 0).div(10_000) : m.amount;
        const volume = settled.reduce((sum, j) => j.milestones.reduce((s, m) => s.add(share(m)), sum), new Prisma.Decimal(0));
        const approved = await tx.delivery.findMany({ where: { sellerId, status: 'approved' }, select: { attempt: true } });
        const firstTry = approved.length ? (approved.filter((d) => d.attempt === 1).length * 100) / approved.length : null;
        const data = {
            settledJobs: settled.length,
            refundedJobs: jobs.filter((j) => j.status === 'refunded').length,
            disputedJobs: disputes,
            settledVolume: volume,
            distinctBuyers: new Set(settled.map((j) => j.buyerId)).size,
            firstTryPassRate: firstTry === null ? null : new Prisma.Decimal(firstTry.toFixed(2)),
            syncedAt: new Date(),
        };
        await tx.reputation.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
    }
}
