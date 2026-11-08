jest.mock('../prisma', () => ({ prisma: {} }));

import { AgentsService } from '../agents/agents.service';
import { AuthService } from '../auth/auth.service';
import { BidRow, BidsRepository } from './bids.repository';
import { bestPickOf, BidsService, toOffer } from './bids.service';

const BUYER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SELLER_USER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const SELLER = '7e6d5c4b-3a29-4180-9f8e-7d6c5b4a3928';

const bid = (name: string, price: number, overrides: Partial<BidRow> = {}): BidRow => ({
    id: `00000000-0000-4000-8000-${String(price).padStart(12, '0')}`,
    price: price as never, deliveryDays: 1, note: `${name} note`, status: 'live', priceCheck: 'cleared', referenceMedian: null,
    fraudScore: 6, holdReason: null, sellerExplanation: null, ownerApprovedRisk: false, createdAt: new Date(),
    seller: { id: SELLER, kind: 'agent', displayName: name, nearAccountId: `${name}.agents.testnet`, headline: 'Run by Mara Ilves' },
    negotiationMessages: [],
    ...overrides,
}) as BidRow;

describe('BidsService', () => {
    let repo: jest.Mocked<BidsRepository>;
    let service: BidsService;
    let agents: jest.Mocked<AgentsService>;
    let caller = BUYER;

    beforeEach(() => {
        caller = BUYER;
        repo = {
            getJobForBidding: jest.fn(), getServiceSeller: jest.fn(), getMySellers: jest.fn(), createBid: jest.fn(),
            getOwnedBid: jest.fn(), editBid: jest.fn(), explainBid: jest.fn(), deleteBid: jest.fn(),
            getOwnedJob: jest.fn(), getBids: jest.fn(), getReputations: jest.fn(),
        } as unknown as jest.Mocked<BidsRepository>;
        agents = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) } as unknown as jest.Mocked<AgentsService>;
        service = new BidsService(repo, { verifySessionToken: jest.fn(async () => caller) } as unknown as AuthService, agents);
    });

    describe('createBid', () => {
        const open = { id: JOB, ref: 'J-1042', buyerId: BUYER, status: 'open', visibility: 'public', serviceId: null } as never;

        it('places an offer on an open public job', async () => {
            caller = SELLER_USER;
            repo.getJobForBidding.mockResolvedValue(open);
            repo.getMySellers.mockResolvedValue([{ id: SELLER, kind: 'agent' }]);
            repo.createBid.mockResolvedValue({ id: 'b1' });
            await expect(service.createBid('Bearer t', { job_id: 'J-1042', price: 36, days: 1 } as never)).resolves.toEqual({ message: 'Bid Successfully Created', id: 'b1' });
            expect(repo.createBid.mock.calls[0]![0]).toEqual({ jobId: JOB, buyerId: BUYER, sellerId: SELLER, price: 36, days: 1, note: null });
            expect(agents.dispatch.mock.calls).toEqual([
                ['fraud_lure', { ownerId: BUYER, jobId: JOB, payload: { subjectType: 'bid', subjectId: 'b1' } }],
                ['price_check', { ownerId: BUYER, jobId: JOB, payload: { bidId: 'b1' } }],
            ]);
        });

        it('blocks self-dealing', async () => {
            repo.getJobForBidding.mockResolvedValue(open);
            await expect(service.createBid('Bearer t', { job_id: 'J-1042', price: 36, days: 1 } as never)).rejects.toThrow('your own job');
        });

        it('needs a seller profile', async () => {
            caller = SELLER_USER;
            repo.getJobForBidding.mockResolvedValue(open);
            repo.getMySellers.mockResolvedValue([]);
            await expect(service.createBid('Bearer t', { job_id: 'J-1042', price: 36, days: 1 } as never)).rejects.toThrow('seller profile');
        });

        it('rejects a second offer on the same job', async () => {
            caller = SELLER_USER;
            repo.getJobForBidding.mockResolvedValue(open);
            repo.getMySellers.mockResolvedValue([{ id: SELLER, kind: 'agent' }]);
            repo.createBid.mockResolvedValue(null);
            await expect(service.createBid('Bearer t', { job_id: 'J-1042', price: 36, days: 1 } as never)).rejects.toThrow('already made an offer');
        });

        it('keeps direct requests for the chosen seller', async () => {
            caller = SELLER_USER;
            repo.getJobForBidding.mockResolvedValue({ ...(open as object), visibility: 'direct', serviceId: 'svc' } as never);
            repo.getMySellers.mockResolvedValue([{ id: SELLER, kind: 'agent' }]);
            repo.getServiceSeller.mockResolvedValue({ sellerId: 'someone-else' });
            await expect(service.createBid('Bearer t', { job_id: 'J-1042', price: 36, days: 1 } as never)).rejects.toThrow('another seller');
        });
    });

    describe('getBids', () => {
        it('lists offers lowest first, holds lures and picks the best', async () => {
            repo.getOwnedJob.mockResolvedValue({ id: JOB });
            repo.getBids.mockResolvedValue([
                bid('dana', 38),
                bid('patchsmith', 36, { negotiationMessages: [{ offeredPrice: 32 as never }] }),
                bid('rustwright', 33, { fraudScore: 12 }),
                bid('fastfix_pro', 30, { status: 'held', fraudScore: 91, holdReason: 'Off-platform request' }),
            ]);
            repo.getReputations.mockResolvedValue([
                { accountId: 'patchsmith.agents.testnet', settledJobs: 41, distinctBuyers: 29, disputedJobs: 1, firstTryPassRate: 92 as never },
                { accountId: 'dana.agents.testnet', settledJobs: 63, distinctBuyers: 44, disputedJobs: 0, firstTryPassRate: 95 as never },
                { accountId: 'rustwright.agents.testnet', settledJobs: 7, distinctBuyers: 6, disputedJobs: 0, firstTryPassRate: 86 as never },
            ]);
            const result = await service.getBids('Bearer t', 'J-1042');
            expect(result.offers.map((o) => o.key)).toEqual(['patchsmith', 'rustwright', 'dana']);
            expect(result.offers[0]).toMatchObject({ price: 36, final: 32, pass: '92%', settled: 41, days: '1 day' });
            expect(result.held).toEqual([expect.objectContaining({ name: 'fastfix_pro', why: 'Off-platform request', fraud: 91 })]);
            expect(result.bestPick).toBe('patchsmith');
            expect(result.waitingFor).toBe(0);
        });

        it('only shows offers to the job buyer', async () => {
            repo.getOwnedJob.mockResolvedValue(null);
            await expect(service.getBids('Bearer t', 'J-1042')).rejects.toThrow('Job not found');
        });
    });

    it('marks new sellers and missing pass rates', () => {
        const offer = toOffer(bid('kofi', 35), undefined);
        expect(offer).toMatchObject({ newSeller: true, pass: '—', settled: 0 });
        expect(bestPickOf([])).toBeNull();
    });
});
