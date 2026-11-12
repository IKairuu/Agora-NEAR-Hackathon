jest.mock('../prisma', () => ({ prisma: {} }));

import { AgentsService } from '../agents/agents.service';
import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { JobRow, JobsRepository } from './jobs.repository';
import { ago, budgetHintOf, JobsService, removalOf, STAGES, statusOf, toJob, toOtherJob } from './jobs.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';

const row = (overrides: Partial<JobRow> = {}): JobRow => ({
    id: JOB, ref: 'J-1042', title: 'Make test_split_rounding pass in split_payment()', description: 'Our payroll contract splits a USDC payment...',
    status: 'open', visibility: 'public', repoUrl: 'https://github.com/lumen-labs/payroll-vault', baseCommit: 'a41c9e2',
    budgetLabel: 'under 40', agreedPrice: null, acceptedBidId: null, postedAt: new Date(), createdAt: new Date(), buyerId: USER,
    categoryRef: { slug: 'rust', name: 'Smart contracts' }, seller: null,
    acceptanceSpecs: [{ specHash: 'ab'.repeat(32), lockedAt: new Date() }], _count: { bids: 6, completionRecords: 0 },
    ...overrides,
}) as JobRow;

describe('JobsService', () => {
    let repo: jest.Mocked<JobsRepository>;
    let service: JobsService;
    let chain: jest.Mocked<ChainService>;
    let agents: jest.Mocked<AgentsService>;
    const post = (over: object = {}) => ({
        id: JOB, ref: 'J-1042', category: 'rust', onchainId: null, postedTx: null, budgetLabel: 'under 40', budgetMaxPublic: null,
        buyer: { nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet' }, acceptanceSpecs: [{ specHash: 'ab'.repeat(32) }], ...over,
    });

    beforeEach(() => {
        repo = {
            getJobs: jest.fn(), getJob: jest.fn(), getOwnedJob: jest.fn(), publishJob: jest.fn(),
            deleteDraft: jest.fn().mockResolvedValue(1), cancelJob: jest.fn().mockResolvedValue(1),
            getPostContext: jest.fn().mockResolvedValue(post()), setOnchainJob: jest.fn().mockResolvedValue(1), setBuyerAccounts: jest.fn(),
        } as unknown as jest.Mocked<JobsRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-post_job-5', explorer_url: '', ok: true, result: '1790000005' }),
            createAccount: jest.fn().mockResolvedValue({ account_id: 'agora-0f9b6c1e.testnet', agents_account_id: 'agents.agora-0f9b6c1e.testnet' }),
        } as unknown as jest.Mocked<ChainService>;
        agents = { dispatchBidders: jest.fn().mockResolvedValue([{ flow: 'bidding', runId: 'r1', status: 'sent' }, { flow: 'bidding', runId: 'r2', status: 'failed' }]) } as unknown as jest.Mocked<AgentsService>;
        service = new JobsService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService, chain, agents);
    });

    describe('delete and cancel', () => {
        it('allows delete for drafts, cancel for open jobs without an accepted offer, nothing after that', () => {
            expect(removalOf({ status: 'draft', acceptedBidId: null } as never)).toBe('delete');
            expect(removalOf({ status: 'open', acceptedBidId: null } as never)).toBe('cancel');
            expect(removalOf({ status: 'negotiating', acceptedBidId: null } as never)).toBe('cancel');
            expect(removalOf({ status: 'negotiating', acceptedBidId: 'b1' } as never)).toBeNull();
            for (const status of ['agreed', 'funded', 'in_progress', 'delivered', 'reviewed', 'disputed', 'released', 'settled', 'refunded', 'expired', 'cancelled']) {
                expect(removalOf({ status, acceptedBidId: null } as never)).toBeNull();
            }
        });

        it('tells only the buyer what they may remove', () => {
            expect(toJob(row({ status: 'draft' }), USER).remove).toBe('delete');
            expect(toJob(row({ status: 'draft' }), 'someone-else').remove).toBeNull();
            expect(toOtherJob(row()).remove).toBe('cancel');
        });

        it('deletes the buyer\'s own draft', async () => {
            repo.getOwnedJob.mockResolvedValue(row({ status: 'draft' }));
            await expect(service.deleteJob('Bearer t', 'J-1042')).resolves.toMatchObject({ ref: 'J-1042' });
            expect(repo.getOwnedJob).toHaveBeenCalledWith(USER, { ref: 'J-1042' });
            expect(repo.deleteDraft).toHaveBeenCalledWith(USER, JOB);
        });

        it('does not find another user\'s job', async () => {
            repo.getOwnedJob.mockResolvedValue(null);
            await expect(service.deleteJob('Bearer t', 'J-1042')).rejects.toThrow('Job not found');
            await expect(service.cancelJob('Bearer t', { id: 'J-1042' })).rejects.toThrow('Job not found');
            expect(repo.deleteDraft).not.toHaveBeenCalled();
            expect(repo.cancelJob).not.toHaveBeenCalled();
        });

        it('refuses to delete or cancel an agreed or funded job', async () => {
            for (const status of ['agreed', 'funded', 'delivered', 'disputed']) {
                repo.getOwnedJob.mockResolvedValue(row({ status: status as never }));
                await expect(service.deleteJob('Bearer t', 'J-1042')).rejects.toThrow('Open a dispute');
                await expect(service.cancelJob('Bearer t', { id: 'J-1042' })).rejects.toThrow('Open a dispute');
            }
            repo.getOwnedJob.mockResolvedValue(row({ status: 'negotiating', acceptedBidId: 'b1' }));
            await expect(service.cancelJob('Bearer t', { id: 'J-1042' })).rejects.toThrow('Open a dispute');
            expect(repo.deleteDraft).not.toHaveBeenCalled();
            expect(repo.cancelJob).not.toHaveBeenCalled();
        });

        it('sends drafts to delete and posted jobs to cancel', async () => {
            repo.getOwnedJob.mockResolvedValue(row({ status: 'open' }));
            await expect(service.deleteJob('Bearer t', 'J-1042')).rejects.toThrow('Cancel it instead');
            repo.getOwnedJob.mockResolvedValue(row({ status: 'draft' }));
            await expect(service.cancelJob('Bearer t', { id: 'J-1042' })).rejects.toThrow('Delete it instead');
        });

        it('cancels an open job', async () => {
            repo.getOwnedJob.mockResolvedValue(row({ status: 'negotiating' }));
            await expect(service.cancelJob('Bearer t', { id: 'J-1042' })).resolves.toMatchObject({ ref: 'J-1042' });
            expect(repo.cancelJob).toHaveBeenCalledWith(USER, JOB);
        });

        it('reports a race with a seller accepting', async () => {
            repo.getOwnedJob.mockResolvedValue(row({ status: 'open' }));
            repo.cancelJob.mockResolvedValue(0);
            await expect(service.cancelJob('Bearer t', { id: 'J-1042' })).rejects.toThrow('A seller was agreed');
            repo.getOwnedJob.mockResolvedValue(row({ status: 'draft' }));
            repo.deleteDraft.mockResolvedValue(0);
            await expect(service.deleteJob('Bearer t', 'J-1042')).rejects.toThrow('changed while you were deleting');
        });
    });

    it('maps rows to the OtherJob shape', () => {
        expect(toOtherJob(row())).toMatchObject({ id: 'J-1042', cat: 'Smart contracts', budget: 'under 40', status: ['info', 'Getting offers'], at: 1, grp: 'offers', note: '6 offers so far.', posted: true });
        expect(toOtherJob(row({ status: 'funded', agreedPrice: 32 as never, seller: { displayName: 'patchsmith', ownerId: 'x' } }))).toMatchObject({ budget: '32.00', status: ['acc', 'Payment protected'], who: 'patchsmith', grp: 'working' });
    });

    it('shows Settled once a released job has its completion record, and gives each stage its own node', () => {
        expect(statusOf({ status: 'released', _count: { completionRecords: 1 } })).toBe('settled');
        expect(statusOf({ status: 'released', _count: { completionRecords: 0 } })).toBe('released');
        expect(statusOf({ status: 'refunded', _count: { completionRecords: 0 } })).toBe('refunded');
        expect([STAGES['funded']!.at, STAGES['delivered']!.at, STAGES['released']!.at, STAGES['settled']!.at]).toEqual([3, 4, 6, 7]);
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
        await expect(service.publishJob('Bearer t', { id: 'J-1042' })).resolves.toEqual({
            message: 'Job Successfully Published', id: JOB, ref: 'J-1042', posted: true, onchainId: '1790000005', postTx: 'mock-post_job-5', postError: null, bidders: 1,
        });
        expect(agents.dispatchBidders.mock.calls[0]).toEqual([JOB]);
        const [role, signer, method, args] = chain.callAs.mock.calls[0]!;
        expect([role, signer, method]).toEqual(['transaction_agent', 'agents.lumen.testnet', 'post_job']);
        expect(args).toMatchObject({ category: 'rust', budget_hint: '40000000', spec_hash: 'ab'.repeat(32) });
        expect(BigInt(args['deadline'] as string)).toBeGreaterThan(BigInt(Date.now()) * 1_000_000n);
        expect(repo.setOnchainJob.mock.calls[0]).toEqual([USER, JOB, 1790000005n, 'mock-post_job-5']);
    });

    it('creates the buyer accounts before the first post_job', async () => {
        repo.getOwnedJob.mockResolvedValue(row({ status: 'draft' }));
        repo.publishJob.mockResolvedValue(1);
        repo.getPostContext.mockResolvedValue(post({ buyer: { nearAccountId: null, agentsAccountId: null } }) as never);
        await service.publishJob('Bearer t', { id: 'J-1042' });
        expect(repo.setBuyerAccounts.mock.calls[0]).toEqual([USER, 'agora-0f9b6c1e.testnet', 'agents.agora-0f9b6c1e.testnet']);
        expect(chain.callAs.mock.calls[0]![1]).toBe('agents.agora-0f9b6c1e.testnet');
    });

    it('does not post a job that is already on chain', async () => {
        repo.getOwnedJob.mockResolvedValue(row({ status: 'open' }));
        repo.publishJob.mockResolvedValue(1);
        repo.getPostContext.mockResolvedValue(post({ onchainId: 1790000001n, postedTx: 'mock-post_job-1' }) as never);
        await expect(service.publishJob('Bearer t', { id: 'J-1042' })).resolves.toMatchObject({ posted: true, onchainId: '1790000001', postTx: 'mock-post_job-1' });
        expect(chain.callAs.mock.calls).toHaveLength(0);
    });

    it('keeps the publish when post_job is refused', async () => {
        repo.getOwnedJob.mockResolvedValue(row({ status: 'draft' }));
        repo.publishJob.mockResolvedValue(1);
        chain.callAs.mockRejectedValue(new Error('No signing key for agents.lumen.testnet'));
        await expect(service.publishJob('Bearer t', { id: 'J-1042' })).resolves.toMatchObject({
            message: 'Job Successfully Published', posted: false, onchainId: null, postError: 'No signing key for agents.lumen.testnet',
        });
        expect(repo.setOnchainJob.mock.calls).toHaveLength(0);
    });

    it('still publishes when no bidding agent could be reached', async () => {
        repo.getOwnedJob.mockResolvedValue(row({ status: 'draft' }));
        repo.publishJob.mockResolvedValue(1);
        agents.dispatchBidders.mockResolvedValue([]);
        await expect(service.publishJob('Bearer t', { id: 'J-1042' })).resolves.toMatchObject({ message: 'Job Successfully Published', bidders: 0 });
    });

    it('turns the public budget into a budget hint', () => {
        expect(budgetHintOf({ budgetMaxPublic: 55 as never, budgetLabel: 'under 40' })).toBe('55000000');
        expect(budgetHintOf({ budgetMaxPublic: null, budgetLabel: '30–60' })).toBe('60000000');
        expect(budgetHintOf({ budgetMaxPublic: null, budgetLabel: null })).toBe('0');
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
