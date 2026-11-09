import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { CreateSpec } from './dto/CreateSpec.dto.js';
import { CreateSpecBulk } from './dto/CreateSpecBulk.dto.js';
import { EditSpec } from './dto/EditSpec.dto.js';
import { LockSpec } from './dto/LockSpec.dto.js';
import { JobKey, SpecRow, SpecsRepository } from './specs.repository.js';

const EDITABLE_JOB_STATUSES = ['draft', 'open', 'negotiating'];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const canonical = (value: Json): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k] ?? null)}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const testFilesOf = (row: SpecRow): { path: string; content: string }[] =>
    Array.isArray(row.testFiles) ? (row.testFiles as { path: string; content: string }[]) : [];

export const specHashOf = (row: SpecRow): string => {
    const doc: Json = {
        job: row.job.id,
        version: row.version,
        test_command: row.testCommand,
        build_command: row.buildCommand,
        failing_tests: [...row.failingTests],
        allowed_paths: [...row.allowedPaths],
        test_files: testFilesOf(row)
            .map((f) => ({ path: f.path, sha256: createHash('sha256').update(f.content).digest('hex') }))
            .sort((a, b) => a.path.localeCompare(b.path)),
        checks: row.checks.map((c) => ({ position: c.position, name: c.name, how_verified: c.howVerified, weight: c.weight })),
        holdout_hash: row.holdout?.holdoutHash ?? null,
    };
    return createHash('sha256').update(canonical(doc)).digest('hex');
};

export const toSpecView = (row: SpecRow) => ({
    id: row.id,
    jobId: row.job.ref,
    version: row.version,
    testCommand: row.testCommand,
    buildCommand: row.buildCommand,
    failingTests: row.failingTests,
    allowedPaths: row.allowedPaths,
    testFiles: testFilesOf(row),
    specHash: row.specHash,
    holdoutHash: row.holdoutHash,
    locked: row.lockedAt !== null,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
    rows: row.checks.map((c): [string, string, string] => [c.name, c.howVerified, c.weight === 'required' ? 'Required' : 'Advisory']),
});

@Injectable()
export class SpecsService {
    constructor(
        private readonly specsRepository: SpecsRepository,
        private readonly authService: AuthService,
    ) {}

    async createSpec(token: string, body: CreateSpec) {
        const authId = await this.authId(token);
        const plan = await this.planCreate(authId, body);
        const row = await this.specsRepository.createSpec(plan.jobId, plan.version, body);
        return { message: 'Spec Successfully Created', id: row.id, version: plan.version };
    }

    async createSpecs(token: string, body: CreateSpecBulk) {
        const authId = await this.authId(token);
        const seen = new Set<string>();
        const items: { jobId: string; version: number; body: CreateSpec }[] = [];
        for (const item of body.items) {
            const plan = await this.planCreate(authId, item);
            if (seen.has(plan.jobId)) throw new BadRequestException('Send one spec per job');
            seen.add(plan.jobId);
            items.push({ jobId: plan.jobId, version: plan.version, body: item });
        }
        const ids = await this.specsRepository.createSpecs(items);
        return { message: 'Specs Successfully Created', ids };
    }

    async getSpecs(token: string, job: string) {
        const authId = await this.authId(token);
        if (!job) throw new BadRequestException('Job id is required');
        const row = await this.specsRepository.getSpecs(authId, this.jobKey(job));
        if (!row) throw new NotFoundException('This job has no spec yet');
        return toSpecView(row);
    }

    async getSpec(token: string, id: string) {
        const authId = await this.authId(token);
        if (!isUUID(id)) throw new BadRequestException('Spec id must be a valid id');
        const row = await this.specsRepository.getSpec(authId, id);
        if (!row) throw new NotFoundException('Spec not found');
        return toSpecView(row);
    }

    async editSpec(token: string, body: EditSpec) {
        const authId = await this.authId(token);
        const row = await this.ownedSpec(authId, body.id);
        if (row.lockedAt) throw new BadRequestException('This spec is locked and can no longer change');
        const key = this.jobKey(body.job_id);
        if (('id' in key && key.id !== row.job.id) || ('ref' in key && key.ref !== row.job.ref)) {
            throw new BadRequestException('A spec cannot move to another job');
        }
        this.requireRequiredCheck(body);
        const count = await this.specsRepository.editSpec(authId, body);
        if (count === 0) throw new ConflictException('This spec was locked while you were editing it');
        return { message: 'Spec Successfully Edited', id: body.id };
    }

    async lockSpec(token: string, body: LockSpec) {
        const authId = await this.authId(token);
        const row = await this.ownedSpec(authId, body.id);
        if (row.lockedAt) throw new BadRequestException('This spec is already locked');
        if (!row.checks.some((c) => c.weight === 'required')) throw new BadRequestException('A spec needs at least one required check');
        const specHash = specHashOf(row);
        const holdoutHash = row.holdout?.holdoutHash ?? null;
        const count = await this.specsRepository.lockSpec(authId, body.id, specHash, holdoutHash);
        if (count === 0) throw new ConflictException('This spec was locked by another request');
        return { message: 'Spec Successfully Locked', id: body.id, specHash, holdoutHash };
    }

    async deleteSpec(token: string, id: string) {
        const authId = await this.authId(token);
        const row = await this.ownedSpec(authId, id);
        if (row.lockedAt) throw new BadRequestException('A locked spec cannot be deleted');
        const count = await this.specsRepository.deleteSpec(authId, id);
        if (count === 0) throw new ConflictException('This spec was locked before it could be deleted');
        return { message: 'Spec Successfully Deleted' };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job)) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }

    private async ownedSpec(authId: string, id: string): Promise<SpecRow> {
        if (!isUUID(id)) throw new BadRequestException('Spec id must be a valid id');
        const row = await this.specsRepository.getOwnedSpec(authId, id);
        if (!row) throw new NotFoundException('Spec not found');
        return row;
    }

    private requireRequiredCheck(body: CreateSpec) {
        if (!body.checks.some((c) => (c.weight ?? 'required') === 'required')) {
            throw new BadRequestException('A spec needs at least one required check');
        }
    }

    private async planCreate(authId: string, body: CreateSpec): Promise<{ jobId: string; version: number }> {
        this.requireRequiredCheck(body);
        const job = await this.specsRepository.getOwnedJob(authId, this.jobKey(body.job_id));
        if (!job) throw new NotFoundException('Job not found');
        if (!EDITABLE_JOB_STATUSES.includes(job.status)) throw new BadRequestException('The spec cannot change after the job is agreed');
        const latest = await this.specsRepository.getLatestVersion(job.id);
        if (latest && !latest.lockedAt) throw new BadRequestException('This job already has a draft spec. Edit it instead.');
        return { jobId: job.id, version: (latest?.version ?? 0) + 1 };
    }
}
