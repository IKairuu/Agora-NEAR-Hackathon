import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

export interface NotificationInput {
    userId: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
}

@Injectable()
export class InternalRepository {
    async getJob(id: string) {
        return prisma.job.findFirst({
            where: { id },
            select: { id: true, ref: true, title: true, buyerId: true, seller: { select: { ownerId: true } } },
        });
    }

    async getBid(id: string) {
        return prisma.bid.findFirst({
            where: { id },
            select: {
                id: true, status: true, price: true, priceCheck: true, fraudScore: true, holdReason: true,
                job: { select: { id: true, ref: true, buyerId: true } },
                seller: { select: { displayName: true, ownerId: true } },
            },
        });
    }

    async setBidStatus(id: string, from: string, status: 'live' | 'held', holdReason: string | null) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.bid.updateMany({
                where: { id, status: from as 'pending_check' | 'live' },
                data: { status, ...(holdReason !== null ? { holdReason } : {}) },
            });
            return updated.count;
        });
    }

    async createNotifications(items: NotificationInput[]) {
        if (items.length === 0) return 0;
        return prisma.$transaction(async (tx) => {
            const created = await tx.notification.createMany({ data: items });
            return created.count;
        });
    }
}
