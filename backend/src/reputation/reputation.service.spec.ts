jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { Prisma } from '../generated/prisma/client';
import { ReputationRepository } from './reputation.repository';
import { ReputationService } from './reputation.service';

const BUYER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SELLER_USER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const job = (over: object = {}) => ({
    id: 'j1', ref: 'J-1042', status: 'released', buyerId: BUYER, buyer: { nearAccountId: 'lumen.testnet' },
    seller: { ownerId: SELLER_USER, nearAccountId: 'patchsmith.testnet' }, ratings: [], ...over,
});

describe('ReputationService', () => {
    let repo: jest.Mocked<ReputationRepository>;
    let chain: jest.Mocked<ChainService>;
    let caller = BUYER;
    let service: ReputationService;

    beforeEach(() => {
        caller = BUYER;
        repo = {
            getReputation: jest.fn(), getRatings: jest.fn().mockResolvedValue([]), getRatingTarget: jest.fn().mockResolvedValue(job()),
            createRating: jest.fn().mockResolvedValue({ id: 'r1' }),
        } as unknown as jest.Mocked<ReputationRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-rate-1', explorer_url: '', result: null }),
            explorerTxUrl: jest.fn((tx: string) => `https://testnet.nearblocks.io/txns/${tx}`),
        } as unknown as jest.Mocked<ChainService>;
        service = new ReputationService(repo, { verifySessionToken: jest.fn(async () => caller) } as unknown as AuthService, chain);
    });

    it('builds the public record from settled jobs, records and ratings', async () => {
        repo.getReputation.mockResolvedValue({
            rep: { settledJobs: 4, refundedJobs: 1, disputedJobs: 0, settledVolume: new Prisma.Decimal(140), distinctBuyers: 3, firstTryPassRate: new Prisma.Decimal(87.5), syncedAt: null },
            records: [{ tokenId: 'agora-J-1042', amount: new Prisma.Decimal(31.36), mintTx: 'mock-release-1', mintedAt: new Date(), job: { ref: 'J-1042', title: 'Split fix' } }],
            stats: { _avg: { stars: 4.666 }, _count: { _all: 3 } },
            ratings: [],
        } as never);
        await expect(service.getReputation('PatchSmith.testnet')).resolves.toMatchObject({
            account: 'patchsmith.testnet', settled: 4, refunded: 1, volume: 140, buyers: 3, pass: '88%', newSeller: false, rating: 4.7, ratings: 3,
            records: [expect.objectContaining({ tokenId: 'agora-J-1042', amount: 31.36, explorer: 'https://testnet.nearblocks.io/txns/mock-release-1' })],
        });
    });

    it('shows a blank record for a new account and refuses bad names', async () => {
        repo.getReputation.mockResolvedValue({ rep: null, records: [], stats: { _avg: { stars: null }, _count: { _all: 0 } }, ratings: [] } as never);
        await expect(service.getReputation('fresh.testnet')).resolves.toMatchObject({ settled: 0, pass: '—', newSeller: true, rating: null });
        await expect(service.getReputation('drop table;')).rejects.toThrow('not a valid NEAR account');
    });

    it('lets the buyer rate the seller through the contract', async () => {
        await expect(service.createRating('Bearer t', { job_id: 'J-1042', stars: 5, comment: ' Great fix ' })).resolves.toMatchObject({ message: 'Rating Successfully Saved', ratee: 'patchsmith.testnet' });
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'lumen.testnet', 'rate', { job_id: 'J-1042', stars: 5 }]);
        expect(repo.createRating.mock.calls[0]?.[0]).toMatchObject({ raterId: BUYER, rateeAccount: 'patchsmith.testnet', rateeUserId: SELLER_USER, comment: 'Great fix', ratingTx: 'mock-rate-1' });
    });

    it('lets the seller rate the buyer', async () => {
        caller = SELLER_USER;
        await service.createRating('Bearer t', { job_id: 'J-1042', stars: 4 } as never);
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'patchsmith.testnet', 'rate', { job_id: 'J-1042', stars: 4 }]);
        expect(repo.createRating.mock.calls[0]?.[0]).toMatchObject({ rateeAccount: 'lumen.testnet', rateeUserId: BUYER });
    });

    it.each([
        [{ status: 'delivered' }, 'once the job is paid'],
        [{ ratings: [{ id: 'r0' }] }, 'already rated'],
        [{ buyer: { nearAccountId: null } }, 'need a NEAR account'],
    ])('refuses a rating it should not save %#', async (over, msg) => {
        repo.getRatingTarget.mockResolvedValue(job(over) as never);
        await expect(service.createRating('Bearer t', { job_id: 'J-1042', stars: 5 } as never)).rejects.toThrow(msg);
        expect(chain.callAs.mock.calls).toHaveLength(0);
    });
});
