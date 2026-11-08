jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { JobRow, JobsRepository } from './jobs.repository';
import { ago, JobsService, toOtherJob } from './jobs.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';

const row = (overrides: Partial<JobRow> = {}): JobRow => ({
    id: JOB, ref: 'J-1042', title: 'Make test_split_rounding pass in split_payment()', description: 'Our payroll contract splits a USDC payment...',
    status: 'open', visibility: 'public', repoUrl: 'https://github.com/lumen-labs/payroll-vault', baseCommit: 'a41c9e2',
    budgetLabel: 'under 40', agreedPrice: null, postedAt: new Date(), createdAt: new Date(), buyerId: USER,
    categoryRef: { slug: 'rust', name: 'Smart contracts' }, seller: null,
    acceptanceSpecs: [{ specHash: 'ab'.repeat(32), lockedAt: new Date() }], _count: { bids: 6 },
    ...overrides,
}) as JobRow;

describe('JobsService', () => {
    let repo: jest.Mocked<JobsRepository>;
    let service: JobsService;

    beforeEach(() => {
        repo = { getJobs: jest.fn(), getJob: jest.fn(), getOwnedJob: jest.fn(), publishJob: jest.fn() } as unknown as jest.Mocked<JobsRepository>;
        service = new JobsService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService);
    });

    it('maps rows to the OtherJob shape', () => {
        expect(toOtherJob(row())).toMatchObject({ id: 'J-1042', cat: 'Smart contracts', budget: 'under 40', status: ['info', 'Getting offers'], at: 1, grp: 'offers', note: '6 offers so far.', posted: true });
        expect(toOtherJob(row({ status: 'funded', agreedPrice: 32 as never, seller: { displayName: 'patchsmith', ownerId: 'x' } }))).toMatchObject({ budget: '32.00', status: ['acc', 'Payment protected'], who: 'patchsmith', grp: 'working' });
    });

    it('filters by group', async () => {
        repo.getJobs.mockResolvedValue([row(), row({ ref: 'J-1043', status: 'settled' })]);
        await expect(service.getJobs('Bearer t', 'done')).resolves.toHaveLength(1);
        await expect(service.getJobs('Bearer t', 'all')).resolves.toHaveLength(2);
    });

    it('returns a job with its stage name', async () => {
        repo.getJob.mockResolvedValue(row());
        await expect(service.getJob('Bearer t', 'J-1042')).resolves.toMatchObject({ id: 'J-1042', stage: 'Offers', repo: 'github.com/lumen-labs/payroll-vault', specLocked: true });
        expect(repo.getJob.mock.calls[0]).toEqual([USER, { ref: 'J-1042' }]);
    });

    it('refuses to publish before the spec is locked', async () => {
        repo.getOwnedJob.mockResolvedValue(row({ status: 'draft', acceptanceSpecs: [{ specHash: null, lockedAt: null }] }));
        await expect(service.publishJob('Bearer t', { id: 'J-1042' })).rejects.toThrow('Lock the spec');
    });

    it('publishes a draft job with a locked spec', async () => {
        repo.getOwnedJob.mockResolvedValue(row({ status: 'draft' }));
        repo.publishJob.mockResolvedValue(1);
        await expect(service.publishJob('Bearer t', { id: 'J-1042' })).resolves.toEqual({ message: 'Job Successfully Published', id: JOB, ref: 'J-1042' });
    });

    it('formats relative times', () => {
        const now = new Date('2026-11-09T12:00:00Z');
        expect(ago(new Date('2026-11-09T11:56:00Z'), now)).toBe('4 min ago');
        expect(ago(new Date('2026-11-08T12:00:00Z'), now)).toBe('yesterday');
    });
});

describe('toOpenJob', () => {
    it('maps a public job to the Open jobs card', () => {
        const { toOpenJob } = jest.requireActual('./jobs.service') as typeof import('./jobs.service');
        const now = new Date('2026-11-09T12:00:00Z');
        const card = toOpenJob({
            ref: 'J-1042', title: 'Make test_split_rounding pass', description: 'The payroll contract loses 1 unit when splitting USDC.', budgetLabel: 'under 40',
            postedAt: new Date('2026-11-09T11:57:00Z'), createdAt: now, categoryRef: { slug: 'rust', name: 'Smart contracts' }, buyer: { displayName: 'Lumen Labs' },
            acceptanceSpecs: [{ failingTests: ['test_split_rounding', 'test_split_dust_to_last'] }], _count: { bids: 6 },
        } as never, now);
        expect(card).toMatchObject({ id: 'J-1042', cats: 'Smart contracts', budget: 'under 40', check: '2 failing tests', bids: 6, buyer: 'Lumen Labs', minutesAgo: 3 });
    });
});
