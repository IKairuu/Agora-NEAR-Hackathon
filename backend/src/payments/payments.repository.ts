import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

@Injectable()
export class PaymentsRepository {
    async getPaymentJob(userId: string, key: JobKey) {
        return prisma.job.findFirst({
            where: { ...key, OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] },
            select: {
                id: true, ref: true, onchainId: true, status: true, agreedPrice: true, buyerId: true,
                buyer: { select: { nearAccountId: true } },
                milestones: { where: { idx: 0 }, select: { amount: true, status: true, releasedAt: true } },
            },
        });
    }
}
