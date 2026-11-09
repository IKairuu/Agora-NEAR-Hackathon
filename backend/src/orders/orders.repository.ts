import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const jobBrief = {
    id: true,
    ref: true,
    title: true,
    status: true,
    budgetLabel: true,
    agreedPrice: true,
    updatedAt: true,
    buyerId: true,
    buyer: { select: { displayName: true } },
    categoryRef: { select: { name: true } },
} satisfies Prisma.JobSelect;

export type JobBrief = Prisma.JobGetPayload<{ select: typeof jobBrief }>;

@Injectable()
export class OrdersRepository {
    async getMySellerIds(userId: string) {
        const rows = await prisma.seller.findMany({ where: { ownerId: userId }, select: { id: true } });
        return rows.map((r) => r.id);
    }

    async getMyServiceIds(sellerIds: string[]) {
        if (sellerIds.length === 0) return [];
        const rows = await prisma.service.findMany({ where: { sellerId: { in: sellerIds } }, select: { id: true } });
        return rows.map((r) => r.id);
    }

    async getWonJobs(sellerIds: string[]) {
        if (sellerIds.length === 0) return [];
        return prisma.job.findMany({ where: { sellerId: { in: sellerIds } }, orderBy: { updatedAt: 'desc' }, take: 100, select: jobBrief });
    }

    async getHireOffers(sellerIds: string[]) {
        if (sellerIds.length === 0) return [];
        return prisma.hireOffer.findMany({
            where: { sellerId: { in: sellerIds }, status: 'sent' },
            select: { id: true, price: true, job: { select: jobBrief } },
        });
    }

    async getMyBids(sellerIds: string[]) {
        if (sellerIds.length === 0) return [];
        return prisma.bid.findMany({
            where: { sellerId: { in: sellerIds }, status: { in: ['pending_check', 'live', 'held', 'shortlisted'] } },
            orderBy: { updatedAt: 'desc' },
            take: 100,
            select: { id: true, price: true, deliveryDays: true, status: true, job: { select: jobBrief } },
        });
    }

    async getDirectRequests(serviceIds: string[], sellerIds: string[]) {
        if (serviceIds.length === 0) return [];
        return prisma.job.findMany({
            where: {
                serviceId: { in: serviceIds },
                visibility: 'direct',
                status: { in: ['draft', 'open', 'negotiating'] },
                bids: { none: { sellerId: { in: sellerIds } } },
            },
            orderBy: { createdAt: 'desc' },
            select: jobBrief,
        });
    }

    async declineRequest(serviceIds: string[], job: JobKey) {
        return prisma.$transaction(async (tx) => {
            const row = await tx.job.findFirst({ where: { ...job, serviceId: { in: serviceIds }, visibility: 'direct' }, select: { id: true, ref: true, title: true, buyerId: true } });
            if (!row) return null;
            await tx.job.update({ where: { id: row.id }, data: { visibility: 'private', serviceId: null } });
            await tx.notification.create({
                data: { userId: row.buyerId, kind: 'request', title: `Your direct request ${row.ref} was declined`, body: 'You can post it to Open jobs instead.', link: `/job?id=${row.ref}` },
            });
            return row;
        });
    }
}
