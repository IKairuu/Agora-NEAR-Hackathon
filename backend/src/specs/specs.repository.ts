import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { SealedHoldout } from '../holdout.js';
import { prisma } from '../prisma.js';
import { CreateSpec } from './dto/CreateSpec.dto.js';
import { EditSpec } from './dto/EditSpec.dto.js';

const specSelect = {
    id: true,
    version: true,
    testCommand: true,
    buildCommand: true,
    failingTests: true,
    allowedPaths: true,
    testFiles: true,
    specHash: true,
    holdoutHash: true,
    lockedAt: true,
    job: { select: { id: true, ref: true } },
    checks: { select: { position: true, name: true, howVerified: true, weight: true }, orderBy: { position: 'asc' } },
    holdout: { select: { holdoutHash: true } },
} satisfies Prisma.AcceptanceSpecSelect;

export type SpecRow = Prisma.AcceptanceSpecGetPayload<{ select: typeof specSelect }>;

export type JobKey = { id: string } | { ref: string };

const readableJob = (userId: string): Prisma.JobWhereInput => ({
    OR: [
        { buyerId: userId },
        { seller: { ownerId: userId } },
        { visibility: 'public', status: { not: 'draft' } },
    ],
});

const specData = (body: CreateSpec) => ({
    testCommand: body.test_command,
    buildCommand: body.build_command ?? null,
    failingTests: body.failing_tests ?? [],
    allowedPaths: body.allowed_paths ?? [],
    testFiles: body.test_files ? body.test_files.map((f) => ({ path: f.path, content: f.content })) : Prisma.DbNull,
});

const checkData = (body: CreateSpec) =>
    body.checks.map((c, i) => ({ position: i, name: c.name, howVerified: c.how_verified, weight: c.weight ?? 'required' }));

@Injectable()
export class SpecsRepository {
    async getOwnedJob(userId: string, job: JobKey) {
        return prisma.job.findFirst({
            where: { ...job, buyerId: userId },
            select: { id: true, ref: true, status: true },
        });
    }

    async getLatestVersion(jobId: string) {
        return prisma.acceptanceSpec.findFirst({
            where: { jobId },
            orderBy: { version: 'desc' },
            select: { id: true, version: true, lockedAt: true },
        });
    }

    async createSpec(jobId: string, version: number, body: CreateSpec) {
        return prisma.$transaction(async (tx) =>
            tx.acceptanceSpec.create({
                data: { jobId, version, ...specData(body), checks: { create: checkData(body) } },
                select: { id: true },
            }),
        );
    }

    async createSpecs(items: { jobId: string; version: number; body: CreateSpec }[]) {
        return prisma.$transaction(async (tx) => {
            const ids: string[] = [];
            for (const item of items) {
                const row = await tx.acceptanceSpec.create({
                    data: { jobId: item.jobId, version: item.version, ...specData(item.body), checks: { create: checkData(item.body) } },
                    select: { id: true },
                });
                ids.push(row.id);
            }
            return ids;
        });
    }

    async getOwnedSpec(userId: string, id: string) {
        return prisma.acceptanceSpec.findFirst({
            where: { id, job: { buyerId: userId } },
            select: specSelect,
        });
    }

    async getSpec(userId: string, id: string) {
        return prisma.acceptanceSpec.findFirst({
            where: { id, job: readableJob(userId) },
            select: specSelect,
        });
    }

    async getSpecs(userId: string, job: JobKey) {
        return prisma.acceptanceSpec.findFirst({
            where: { job: { ...job, ...readableJob(userId) } },
            orderBy: { version: 'desc' },
            select: specSelect,
        });
    }

    async editSpec(userId: string, body: EditSpec) {
        return prisma.$transaction(async (tx) => {
            const updated = await tx.acceptanceSpec.updateMany({
                where: { id: body.id, lockedAt: null, job: { buyerId: userId } },
                data: specData(body),
            });
            if (updated.count === 0) return 0;
            await tx.specCheck.deleteMany({ where: { specId: body.id } });
            await tx.specCheck.createMany({ data: checkData(body).map((c) => ({ ...c, specId: body.id })) });
            return updated.count;
        });
    }

    async sealHoldout(userId: string, specId: string, sealed: SealedHoldout) {
        return prisma.$transaction(async (tx) => {
            const open = await tx.acceptanceSpec.updateMany({
                where: { id: specId, lockedAt: null, job: { buyerId: userId } },
                data: { holdoutHash: null },
            });
            if (open.count === 0) return 0;
            const data = { holdoutHash: sealed.holdoutHash, ciphertext: new Uint8Array(sealed.ciphertext), keyId: sealed.keyId };
            await tx.holdout.upsert({ where: { specId }, create: { specId, ...data }, update: data, select: { id: true } });
            return open.count;
        });
    }

    async lockSpec(userId: string, id: string, specHash: string, holdoutHash: string | null) {
        return prisma.$transaction(async (tx) => {
            const now = new Date();
            const updated = await tx.acceptanceSpec.updateMany({
                where: { id, lockedAt: null, job: { buyerId: userId }, holdout: holdoutHash ? { is: { holdoutHash } } : { is: null } },
                data: { specHash, holdoutHash, approvedAt: now, lockedAt: now },
            });
            return updated.count;
        });
    }

    async deleteSpec(userId: string, id: string) {
        return prisma.$transaction(async (tx) => {
            const deleted = await tx.acceptanceSpec.deleteMany({
                where: { id, lockedAt: null, job: { buyerId: userId } },
            });
            return deleted.count;
        });
    }
}
