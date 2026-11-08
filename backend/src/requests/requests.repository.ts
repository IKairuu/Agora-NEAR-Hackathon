import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

export interface NewJob {
    title: string;
    description: string;
    category: string;
    repoUrl: string | null;
    baseCommit: string | null;
    budgetLabel: string | null;
    serviceId: string | null;
    visibility: string;
    limit: { ciphertext: string; keyRef: string } | null;
}

export interface JobChanges {
    title?: string;
    description: string;
    category?: string;
    repoUrl?: string;
    baseCommit?: string;
    budgetLabel?: string;
    limit: { ciphertext: string; keyRef: string } | null;
}

@Injectable()
export class RequestsRepository {
    async getService(id: string) {
        return prisma.service.findFirst({
            where: { id, active: true },
            select: { id: true, category: true },
        });
    }

    async getOwnedJob(userId: string, id: string) {
        return prisma.job.findFirst({
            where: { id, buyerId: userId },
            select: { id: true, ref: true, status: true },
        });
    }

    async createRequests(userId: string, jobs: NewJob[]) {
        return prisma.$transaction(async (tx) => {
            await tx.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {}, select: { id: true } });
            const created: { id: string; ref: string }[] = [];
            for (const job of jobs) {
                const row = await tx.job.create({
                    data: {
                        buyerId: userId,
                        title: job.title,
                        description: job.description,
                        category: job.category,
                        repoUrl: job.repoUrl,
                        baseCommit: job.baseCommit,
                        budgetLabel: job.budgetLabel,
                        serviceId: job.serviceId,
                        visibility: job.visibility,
                        status: 'draft',
                        limits: job.limit ? { create: { maxPriceCiphertext: job.limit.ciphertext, keyRef: job.limit.keyRef } } : undefined,
                    },
                    select: { id: true, ref: true },
                });
                created.push(row);
            }
            return created;
        });
    }

    async editRequest(userId: string, id: string, changes: JobChanges) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.job.updateMany({
                where: { id, buyerId: userId, status: { in: ['draft', 'open'] } },
                data: {
                    title: changes.title,
                    description: changes.description,
                    category: changes.category,
                    repoUrl: changes.repoUrl,
                    baseCommit: changes.baseCommit,
                    budgetLabel: changes.budgetLabel,
                },
            });
            if (updated.count > 0 && changes.limit) {
                await tx.jobLimit.upsert({
                    where: { jobId: id },
                    create: { jobId: id, maxPriceCiphertext: changes.limit.ciphertext, keyRef: changes.limit.keyRef },
                    update: { maxPriceCiphertext: changes.limit.ciphertext, keyRef: changes.limit.keyRef },
                });
            }
            return updated.count;
        });
    }

    async keepWaiting(userId: string, id: string) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.job.updateMany({
                where: { id, buyerId: userId, status: { in: ['draft', 'open'] } },
                data: { visibility: 'private' },
            });
            return updated.count;
        });
    }
}
