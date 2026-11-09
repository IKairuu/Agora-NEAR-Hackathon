import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const bidSelect = {
    id: true,
    price: true,
    deliveryDays: true,
    note: true,
    status: true,
    priceCheck: true,
    referenceMedian: true,
    fraudScore: true,
    holdReason: true,
    sellerExplanation: true,
    ownerApprovedRisk: true,
    createdAt: true,
    seller: { select: { id: true, kind: true, displayName: true, nearAccountId: true, headline: true } },
    negotiationMessages: {
        where: { sender: 'seller', offeredPrice: { not: null } },
        select: { offeredPrice: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
    },
} satisfies Prisma.BidSelect;

export type BidRow = Prisma.BidGetPayload<{ select: typeof bidSelect }>;
export type ReputationRow = { accountId: string; settledJobs: number; distinctBuyers: number; disputedJobs: number; firstTryPassRate: Prisma.Decimal | null };

@Injectable()
export class BidsRepository {
    async getJobForBidding(job: JobKey) {
        return prisma.job.findFirst({
            where: job,
            select: { id: true, ref: true, onchainId: true, buyerId: true, status: true, visibility: true, serviceId: true },
        });
    }

    async getServiceSeller(serviceId: string) {
        return prisma.service.findFirst({ where: { id: serviceId }, select: { sellerId: true } });
    }

    async getMySellers(userId: string) {
        return prisma.seller.findMany({
            where: { ownerId: userId },
            orderBy: { createdAt: 'asc' },
            select: { id: true, kind: true, nearAccountId: true },
        });
    }

    async createBid(data: { jobId: string; sellerId: string; price: number; days: number; note: string | null }) {
        return prisma.$transaction(async (tx) => {
            const existing = await tx.bid.findFirst({ where: { jobId: data.jobId, sellerId: data.sellerId }, select: { id: true, status: true } });
            if (existing && existing.status !== 'withdrawn') return null;
            if (existing) {
                return tx.bid.update({
                    where: { id: existing.id },
                    data: { price: data.price, deliveryDays: data.days, note: data.note, status: 'pending_check', holdReason: null, fraudScore: null },
                    select: { id: true, onchainId: true, onchainTx: true },
                });
            }
            return tx.bid.create({
                data: { jobId: data.jobId, sellerId: data.sellerId, price: data.price, deliveryDays: data.days, note: data.note },
                select: { id: true, onchainId: true, onchainTx: true },
            });
        });
    }

    async setOnchainBid(userId: string, id: string, onchainId: bigint, txHash: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.bid.updateMany({ where: { id, seller: { ownerId: userId }, onchainId: null }, data: { onchainId, onchainTx: txHash } });
            return updated.count;
        });
    }

    async getOwnedBid(userId: string, id: string) {
        return prisma.bid.findFirst({
            where: { id, seller: { ownerId: userId } },
            select: { id: true, status: true, job: { select: { status: true } } },
        });
    }

    async editBid(userId: string, id: string, data: { price: number; days: number; note: string | null }) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.bid.updateMany({
                where: { id, seller: { ownerId: userId }, status: { in: ['pending_check', 'live', 'held', 'shortlisted'] } },
                data: { price: data.price, deliveryDays: data.days, note: data.note },
            });
            return updated.count;
        });
    }

    async explainBid(userId: string, id: string, explanation: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.bid.updateMany({
                where: { id, seller: { ownerId: userId }, status: 'held' },
                data: { sellerExplanation: explanation },
            });
            return updated.count;
        });
    }

    async deleteBid(userId: string, id: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.bid.updateMany({
                where: { id, seller: { ownerId: userId }, status: { in: ['pending_check', 'live', 'held', 'shortlisted'] } },
                data: { status: 'withdrawn' },
            });
            return updated.count;
        });
    }

    async getOwnedJob(userId: string, job: JobKey) {
        return prisma.job.findFirst({ where: { ...job, buyerId: userId }, select: { id: true } });
    }

    async getBids(jobId: string) {
        return prisma.bid.findMany({
            where: { jobId, status: { in: ['pending_check', 'live', 'shortlisted', 'accepted', 'held'] } },
            select: bidSelect,
        });
    }

    async getReputations(accountIds: string[]): Promise<ReputationRow[]> {
        if (accountIds.length === 0) return [];
        return prisma.reputation.findMany({
            where: { accountId: { in: accountIds } },
            select: { accountId: true, settledJobs: true, distinctBuyers: true, disputedJobs: true, firstTryPassRate: true },
        });
    }
}
