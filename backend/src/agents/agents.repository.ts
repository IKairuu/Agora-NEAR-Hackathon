import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export type JobKey = { id: string } | { ref: string };

@Injectable()
export class AgentsRepository {
    async getPlatformAgent(role: string) {
        return prisma.agent.findFirst({
            where: { role: role as Prisma.EnumAgentRoleFilter['equals'], status: 'active' },
            select: { id: true },
            orderBy: { label: 'asc' },
        });
    }

    async getBuyerContext(jobId: string) {
        return prisma.job.findFirst({
            where: { id: jobId },
            select: { id: true, buyerId: true, status: true, limits: { select: { maxPriceCiphertext: true } } },
        });
    }

    async getAgentSellers(jobId: string, take: number) {
        const job = await prisma.job.findFirst({
            where: { id: jobId, status: { in: ['open', 'negotiating'] }, visibility: 'public' },
            select: { id: true, buyerId: true, category: true },
        });
        if (!job) return [];
        return prisma.seller.findMany({
            where: { kind: 'agent', categories: { has: job.category }, ownerId: { not: job.buyerId }, bids: { none: { jobId: job.id } } },
            select: { id: true, ownerId: true, agentId: true },
            orderBy: { createdAt: 'asc' },
            take,
        });
    }

    async getTeam(userId: string) {
        return prisma.profile.findFirst({
            where: { id: userId },
            select: {
                agentsAccountId: true,
                mandate: { select: { paused: true } },
                sellers: { select: { id: true }, take: 1 },
                agentEvents: { select: { actorLabel: true, message: true, severity: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 },
            },
        });
    }

    async getEvents(userId: string, key: JobKey | null) {
        return prisma.agentEvent.findMany({
            where: key
                ? { job: { ...key, OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] } }
                : { OR: [{ ownerId: userId }, { job: { OR: [{ buyerId: userId }, { seller: { ownerId: userId } }] } }] },
            select: { id: true, actorLabel: true, message: true, severity: true, data: true, createdAt: true, job: { select: { ref: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
}
