import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

const threadSelect = {
    id: true,
    title: true,
    buyerId: true,
    lastMessageAt: true,
    createdAt: true,
    job: { select: { ref: true } },
    buyer: { select: { displayName: true } },
    seller: { select: { id: true, ownerId: true, displayName: true } },
    messages: { select: { body: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ThreadSelect;

export type ThreadRow = Prisma.ThreadGetPayload<{ select: typeof threadSelect }>;

const partyOf = (userId: string): Prisma.ThreadWhereInput => ({
    OR: [{ buyerId: userId }, { seller: { ownerId: userId } }],
});

@Injectable()
export class MessagesRepository {
    async getThreads(userId: string, side: string) {
        const where: Prisma.ThreadWhereInput = side === 'buy' ? { buyerId: userId } : side === 'sell' ? { seller: { ownerId: userId } } : partyOf(userId);
        return prisma.thread.findMany({ where, orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }], take: 100, select: threadSelect });
    }

    async getThread(userId: string, id: string) {
        return prisma.thread.findFirst({ where: { id, ...partyOf(userId) }, select: threadSelect });
    }

    async getOwnedJob(userId: string, job: JobKey) {
        return prisma.job.findFirst({ where: { ...job, buyerId: userId }, select: { id: true, title: true } });
    }

    async getSeller(id: string) {
        return prisma.seller.findFirst({ where: { id }, select: { id: true, ownerId: true } });
    }

    async getBiddingSeller(userId: string, job: JobKey) {
        return prisma.bid.findFirst({
            where: { job, seller: { ownerId: userId }, status: { notIn: ['withdrawn'] } },
            select: { seller: { select: { id: true } }, job: { select: { id: true, title: true, buyerId: true } } },
        });
    }

    async createThread(data: { jobId: string | null; buyerId: string; sellerId: string; title: string }, first: { sender: 'owner' | 'seller'; senderProfileId: string; body: string; notifyUserId: string | null }) {
        return prisma.$transaction(async (tx) => {
            const existing = await tx.thread.findFirst({ where: { jobId: data.jobId, buyerId: data.buyerId, sellerId: data.sellerId }, select: { id: true } });
            const thread = existing ?? (await tx.thread.create({ data, select: { id: true } }));
            await tx.message.create({ data: { threadId: thread.id, sender: first.sender, senderProfileId: first.senderProfileId, body: first.body } });
            await tx.thread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
            if (first.notifyUserId) {
                await tx.notification.create({ data: { userId: first.notifyUserId, kind: 'message', title: data.title, body: first.body.slice(0, 200), link: `/room?id=${thread.id}` } });
            }
            return thread;
        });
    }

    async getMessages(userId: string, threadId: string) {
        return prisma.message.findMany({
            where: { threadId, thread: partyOf(userId) },
            orderBy: { createdAt: 'asc' },
            select: { id: true, sender: true, body: true, cardType: true, createdAt: true },
        });
    }

    async createMessage(threadId: string, sender: 'owner' | 'seller', senderProfileId: string, body: string, notify: { userId: string | null; title: string }) {
        return prisma.$transaction(async (tx) => {
            const row = await tx.message.create({ data: { threadId, sender, senderProfileId, body }, select: { id: true } });
            await tx.thread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
            if (notify.userId) {
                await tx.notification.create({ data: { userId: notify.userId, kind: 'message', title: notify.title, body: body.slice(0, 200), link: `/room?id=${threadId}` } });
            }
            return row;
        });
    }
}
