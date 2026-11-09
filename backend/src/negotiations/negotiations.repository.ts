import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const bidContextSelect = {
    id: true,
    price: true,
    status: true,
    ownerApprovedRisk: true,
    job: { select: { id: true, ref: true, status: true, buyerId: true } },
    seller: { select: { id: true, ownerId: true, displayName: true } },
    negotiationMessages: { select: { round: true, sender: true, offeredPrice: true }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.BidSelect;

export type BidContext = Prisma.BidGetPayload<{ select: typeof bidContextSelect }>;

const offerSelect = {
    id: true,
    status: true,
    price: true,
    bidId: true,
    jobId: true,
    createdAt: true,
    job: { select: { id: true, ref: true, buyerId: true, status: true, onchainId: true, buyer: { select: { nearAccountId: true, agentsAccountId: true } } } },
    seller: { select: { id: true, ownerId: true, displayName: true } },
} satisfies Prisma.HireOfferSelect;

export type OfferRow = Prisma.HireOfferGetPayload<{ select: typeof offerSelect }>;

const partyOf = (userId: string): Prisma.BidWhereInput => ({
    OR: [{ job: { buyerId: userId } }, { seller: { ownerId: userId } }],
});

@Injectable()
export class NegotiationsRepository {
    async getBidContext(userId: string, bidId: string) {
        return prisma.bid.findFirst({ where: { id: bidId, ...partyOf(userId) }, select: bidContextSelect });
    }

    async createNegotiation(data: { jobId: string; bidId: string; round: number; sender: string; body: string; price: number | null; openJob: boolean }) {
        return prisma.$transaction(async (tx) => {
            const row = await tx.negotiationMessage.create({
                data: { jobId: data.jobId, bidId: data.bidId, round: data.round, sender: data.sender, body: data.body, offeredPrice: data.price },
                select: { id: true },
            });
            if (data.openJob) await tx.job.updateMany({ where: { id: data.jobId, status: 'open' }, data: { status: 'negotiating' } });
            return row;
        });
    }

    async getNegotiations(userId: string, bidId: string) {
        return prisma.negotiationMessage.findMany({
            where: { bidId, bid: partyOf(userId) },
            orderBy: { createdAt: 'asc' },
            select: { id: true, round: true, sender: true, body: true, offeredPrice: true, createdAt: true },
        });
    }

    async getOpenOffer(jobId: string) {
        return prisma.hireOffer.findFirst({ where: { jobId, status: 'sent' }, select: { id: true } });
    }

    async createOffer(data: { jobId: string; bidId: string; sellerId: string; price: number }) {
        return prisma.$transaction(async (tx) => {
            const open = await tx.hireOffer.findFirst({ where: { jobId: data.jobId, status: 'sent' }, select: { id: true } });
            if (open) return null;
            return tx.hireOffer.create({ data, select: { id: true } });
        });
    }

    async getOffer(userId: string, id: string) {
        return prisma.hireOffer.findFirst({
            where: { id, OR: [{ job: { buyerId: userId } }, { seller: { ownerId: userId } }] },
            select: offerSelect,
        });
    }

    async getJobOffer(userId: string, job: JobKey) {
        return prisma.hireOffer.findFirst({
            where: { job, OR: [{ job: { buyerId: userId } }, { seller: { ownerId: userId } }] },
            orderBy: { createdAt: 'desc' },
            select: offerSelect,
        });
    }

    async acceptOffer(userId: string, offer: OfferRow) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.hireOffer.updateMany({
                where: { id: offer.id, status: 'sent', seller: { ownerId: userId } },
                data: { status: 'accepted' },
            });
            if (updated.count === 0) return 0;
            await tx.job.update({
                where: { id: offer.jobId },
                data: { status: 'agreed', sellerId: offer.seller.id, acceptedBidId: offer.bidId, agreedPrice: offer.price },
            });
            if (offer.bidId) {
                await tx.bid.update({ where: { id: offer.bidId }, data: { status: 'accepted' } });
                await tx.bid.updateMany({
                    where: { jobId: offer.jobId, id: { not: offer.bidId }, status: { in: ['pending_check', 'live', 'shortlisted'] } },
                    data: { status: 'rejected' },
                });
            }
            return updated.count;
        });
    }

    async declineOffer(userId: string, id: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.hireOffer.updateMany({
                where: { id, status: 'sent', seller: { ownerId: userId } },
                data: { status: 'declined' },
            });
            return updated.count;
        });
    }

    async getAcceptTerms(jobId: string, bidId: string | null) {
        const [bid, spec] = await Promise.all([
            bidId ? prisma.bid.findFirst({ where: { id: bidId, jobId }, select: { id: true, onchainId: true, deliveryDays: true } }) : null,
            prisma.acceptanceSpec.findFirst({
                where: { jobId, lockedAt: { not: null } },
                orderBy: { version: 'desc' },
                select: { specHash: true, holdoutHash: true },
            }),
        ]);
        return { bid, spec };
    }

    async setBuyerAccounts(buyerId: string, nearAccountId: string, agentsAccountId: string) {
        return prisma.$transaction(async (tx) =>
            tx.profile.update({ where: { id: buyerId }, data: { nearAccountId, agentsAccountId }, select: { id: true } }),
        );
    }
}
