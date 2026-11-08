import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { CreateSpec } from './dto/CreateSpec.dto';
import { SpecRow, SpecsRepository } from './specs.repository';
import { specHashOf, SpecsService } from './specs.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const JOB_ID = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const SPEC_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const body = (overrides: Partial<CreateSpec> = {}): CreateSpec => Object.assign(new CreateSpec(), {
    job_id: 'J-1042',
    test_command: 'cargo test --no-fail-fast',
    build_command: 'cargo build --release --target wasm32-unknown-unknown',
    failing_tests: ['test_split_rounding', 'test_split_dust_to_last'],
    allowed_paths: ['src/split.rs'],
    checks: [
        { name: 'Named failing tests now pass', how_verified: 'test_split_rounding, test_split_dust_to_last', weight: 'required' },
        { name: 'Quality notes', how_verified: 'Model-judged readability', weight: 'advisory' },
    ],
    ...overrides,
});

const row = (overrides: Partial<SpecRow> = {}): SpecRow => ({
    id: SPEC_ID,
    version: 1,
    testCommand: 'cargo test --no-fail-fast',
    buildCommand: null,
    failingTests: ['test_split_rounding'],
    allowedPaths: ['src/split.rs'],
    testFiles: [{ path: 'tests/split_rounding.rs', content: 'fn t() {}' }],
    specHash: null,
    holdoutHash: null,
    lockedAt: null,
    job: { id: JOB_ID, ref: 'J-1042' },
    checks: [
        { position: 0, name: 'Named failing tests now pass', howVerified: 'test_split_rounding', weight: 'required' },
        { position: 1, name: 'Quality notes', howVerified: 'Model-judged readability', weight: 'advisory' },
    ],
    holdout: null,
    ...overrides,
}) as SpecRow;

describe('SpecsService', () => {
    let repo: jest.Mocked<SpecsRepository>;
    let service: SpecsService;

    beforeEach(() => {
        repo = {
            getOwnedJob: jest.fn(),
            getLatestVersion: jest.fn(),
            createSpec: jest.fn(),
            createSpecs: jest.fn(),
            getOwnedSpec: jest.fn(),
            getSpec: jest.fn(),
            getSpecs: jest.fn(),
            editSpec: jest.fn(),
            lockSpec: jest.fn(),
            deleteSpec: jest.fn(),
        } as unknown as jest.Mocked<SpecsRepository>;
        const auth = { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService;
        service = new SpecsService(repo, auth);
    });

    describe('createSpec', () => {
        it('creates version 1 on a job the user owns', async () => {
            repo.getOwnedJob.mockResolvedValue({ id: JOB_ID, ref: 'J-1042', status: 'open' });
            repo.getLatestVersion.mockResolvedValue(null);
            repo.createSpec.mockResolvedValue({ id: SPEC_ID });
            await expect(service.createSpec('Bearer t', body())).resolves.toEqual({ message: 'Spec Successfully Created', id: SPEC_ID, version: 1 });
            expect(repo.getOwnedJob.mock.calls[0]).toEqual([USER, { ref: 'J-1042' }]);
        });

        it('rejects a job the user does not own', async () => {
            repo.getOwnedJob.mockResolvedValue(null);
            await expect(service.createSpec('Bearer t', body())).rejects.toBeInstanceOf(NotFoundException);
        });

        it('rejects a second draft', async () => {
            repo.getOwnedJob.mockResolvedValue({ id: JOB_ID, ref: 'J-1042', status: 'open' });
            repo.getLatestVersion.mockResolvedValue({ id: SPEC_ID, version: 1, lockedAt: null });
            await expect(service.createSpec('Bearer t', body())).rejects.toThrow('already has a draft spec');
        });

        it('rejects changes after the job is agreed', async () => {
            repo.getOwnedJob.mockResolvedValue({ id: JOB_ID, ref: 'J-1042', status: 'funded' });
            await expect(service.createSpec('Bearer t', body())).rejects.toBeInstanceOf(BadRequestException);
        });

        it('needs at least one required check', async () => {
            const advisoryOnly = body({ checks: [{ name: 'Quality notes', how_verified: 'Model', weight: 'advisory' }] });
            await expect(service.createSpec('Bearer t', advisoryOnly)).rejects.toThrow('at least one required check');
        });

        it('rejects a malformed job id', async () => {
            await expect(service.createSpec('Bearer t', body({ job_id: 'job-1' }))).rejects.toThrow('Job id is not valid');
        });
    });

    describe('editSpec', () => {
        it('refuses to edit a locked spec', async () => {
            repo.getOwnedSpec.mockResolvedValue(row({ lockedAt: new Date() }));
            await expect(service.editSpec('Bearer t', Object.assign(body(), { id: SPEC_ID }))).rejects.toThrow('locked');
        });

        it('refuses to move a spec to another job', async () => {
            repo.getOwnedSpec.mockResolvedValue(row());
            await expect(service.editSpec('Bearer t', Object.assign(body({ job_id: 'J-9999' }), { id: SPEC_ID }))).rejects.toThrow('another job');
        });
    });

    describe('lockSpec', () => {
        it('locks with a sha256 spec hash', async () => {
            repo.getOwnedSpec.mockResolvedValue(row());
            repo.lockSpec.mockResolvedValue(1);
            const result = await service.lockSpec('Bearer t', { id: SPEC_ID });
            expect(result.specHash).toMatch(/^[0-9a-f]{64}$/);
            expect(result.holdoutHash).toBeNull();
            expect(repo.lockSpec.mock.calls[0]).toEqual([USER, SPEC_ID, result.specHash, null]);
        });

        it('carries the holdout hash when a holdout exists', async () => {
            repo.getOwnedSpec.mockResolvedValue(row({ holdout: { holdoutHash: 'ab'.repeat(32) } }));
            repo.lockSpec.mockResolvedValue(1);
            await expect(service.lockSpec('Bearer t', { id: SPEC_ID })).resolves.toMatchObject({ holdoutHash: 'ab'.repeat(32) });
        });

        it('refuses to lock twice', async () => {
            repo.getOwnedSpec.mockResolvedValue(row({ lockedAt: new Date() }));
            await expect(service.lockSpec('Bearer t', { id: SPEC_ID })).rejects.toThrow('already locked');
        });
    });

    describe('specHashOf', () => {
        it('is stable for the same content', () => {
            expect(specHashOf(row())).toBe(specHashOf(row()));
        });

        it('changes when a locked test file changes', () => {
            const changed = row({ testFiles: [{ path: 'tests/split_rounding.rs', content: 'fn t() { assert!(false) }' }] });
            expect(specHashOf(changed)).not.toBe(specHashOf(row()));
        });

        it('changes when a check changes', () => {
            const changed = row({ checks: [{ position: 0, name: 'Named failing tests now pass', howVerified: 'test_split_rounding', weight: 'advisory' }] });
            expect(specHashOf(changed)).not.toBe(specHashOf(row()));
        });
    });

    describe('getSpecs', () => {
        it('returns rows in the frontend SPEC shape', async () => {
            repo.getSpecs.mockResolvedValue(row());
            const view = await service.getSpecs('Bearer t', 'J-1042');
            expect(view.jobId).toBe('J-1042');
            expect(view.rows).toEqual([
                ['Named failing tests now pass', 'test_split_rounding', 'Required'],
                ['Quality notes', 'Model-judged readability', 'Advisory'],
            ]);
        });

        it('returns 404 when the job has no spec', async () => {
            repo.getSpecs.mockResolvedValue(null);
            await expect(service.getSpecs('Bearer t', JOB_ID)).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
