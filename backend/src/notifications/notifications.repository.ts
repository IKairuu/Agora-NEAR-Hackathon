import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

@Injectable()
export class NotificationsRepository {
    async getNotifications(userId: string) {
        return prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { id: true, kind: true, title: true, body: true, link: true, read: true, createdAt: true },
        });
    }

    async readNotifications(userId: string, ids: string[] | null) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.notification.updateMany({
                where: { userId, read: false, ...(ids ? { id: { in: ids } } : {}) },
                data: { read: true },
            });
            return updated.count;
        });
    }
}
