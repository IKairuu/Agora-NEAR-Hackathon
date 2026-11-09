import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

export interface RunOutcome {
    runId: string;
    failed: boolean;
    exitCode: number | null;
    installExit: number | null;
    baselineExitCode: number | null;
    scopeOk: boolean | null;
    changedFiles: string[];
    logHash: string;
    logPath: string;
    durationMs: number;
    error: string | null;
    result: Prisma.InputJsonValue;
    deliveryId: string;
    verdict: 'pass' | 'fail';
    reason: string | null;
    diffStats: Prisma.InputJsonValue;
}

const deliveryJob = { select: { id: true, ref: true, title: true, status: true, buyerId: true, seller: { select: { ownerId: true } } } } as const;

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
                id: true, onchainId: true, status: true, price: true, priceCheck: true, fraudScore: true, holdReason: true,
                job: { select: { id: true, ref: true, onchainId: true, buyerId: true } },
                seller: { select: { displayName: true, ownerId: true } },
            },
        });
    }

    async getAgentBid(id: string) {
        return prisma.bid.findFirst({
            where: { id },
            select: {
                id: true, status: true, price: true,
                job: { select: { id: true, ref: true, status: true, buyerId: true } },
                seller: { select: { id: true, ownerId: true, agentId: true, kind: true, displayName: true } },
            },
        });
    }

    async createHireOffer(data: { jobId: string; bidId: string; sellerId: string; price: number }) {
        return prisma.$transaction(async (tx) => {
            const open = await tx.hireOffer.findFirst({ where: { jobId: data.jobId, status: 'sent' }, select: { id: true } });
            if (open) return null;
            return tx.hireOffer.create({ data, select: { id: true } });
        });
    }

    async getOwner(id: string) {
        return prisma.profile.findFirst({ where: { id }, select: { id: true } });
    }

    async pauseByGuardian(ownerId: string, txHash: string | null) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.mandate.updateMany({
                where: { ownerId, paused: false },
                data: { paused: true, pausedBy: 'guardian', pausedAt: new Date(), ...(txHash ? { lastTxHash: txHash } : {}) },
            });
            return updated.count;
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

    async getReviewRun(runId: string) {
        return prisma.reviewRun.findFirst({
            where: { runId },
            select: {
                id: true, status: true,
                delivery: { select: { id: true, attempt: true, commitSha: true, milestone: { select: { job: deliveryJob } } } },
            },
        });
    }

    async saveRunResult(o: RunOutcome) {
        return prisma.$transaction(async (tx) => {
            const run = await tx.reviewRun.updateMany({
                where: { runId: o.runId, status: { in: ['queued', 'running'] } },
                data: {
                    status: o.failed ? 'failed' : 'done', exitCode: o.exitCode, installExit: o.installExit, baselineExitCode: o.baselineExitCode,
                    scopeOk: o.scopeOk, changedFiles: o.changedFiles, logHash: o.logHash, logPath: o.logPath, durationMs: o.durationMs,
                    error: o.error, result: o.result, finishedAt: new Date(),
                },
            });
            if (run.count === 0) return 0;
            await tx.delivery.updateMany({
                where: { id: o.deliveryId, status: { in: ['submitted', 'reviewing'] } },
                data: { status: 'reviewing', verdict: o.verdict, reason: o.reason, filesTouched: o.changedFiles, diffStats: o.diffStats },
            });
            return run.count;
        });
    }

    async getVoteTally(deliveryId: string) {
        return prisma.delivery.findFirst({
            where: { id: deliveryId },
            select: {
                id: true, status: true, attempt: true, milestoneId: true,
                votes: { select: { approve: true } },
                milestone: { select: { job: deliveryJob } },
            },
        });
    }

    async settleDelivery(deliveryId: string, milestoneId: string, jobId: string, approved: boolean) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.delivery.updateMany({
                where: { id: deliveryId, status: { in: ['submitted', 'reviewing'] } },
                data: { status: approved ? 'approved' : 'rejected' },
            });
            if (updated.count === 0) return 0;
            await tx.milestone.update({ where: { id: milestoneId }, data: { status: approved ? 'in_review' : 'funded' }, select: { id: true } });
            await tx.job.updateMany({ where: { id: jobId, status: 'delivered' }, data: { status: approved ? 'reviewed' : 'in_progress' } });
            return updated.count;
        });
    }

    async recordRecheck(jobId: string, outcome: 'release' | 'refund', at: Date) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.dispute.updateMany({
                where: { milestone: { jobId }, status: 'recheck', recheckOutcome: null },
                data: { recheckOutcome: outcome, recheckAt: at },
            });
            return updated.count;
        });
    }
}
