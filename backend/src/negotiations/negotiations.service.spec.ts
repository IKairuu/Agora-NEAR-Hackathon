jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { BidContext, NegotiationsRepository, OfferRow } from './negotiations.repository';
import { agreedPriceOf, NegotiationsService } from './negotiations.service';

const BUYER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SELLER_USER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const BID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const OFFER = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const SELLER = '7e6d5c4b-3a29-4180-9f8e-7d6c5b4a3928';

const ctx = (overrides: Partial<BidContext> = {}): BidContext => ({
    id: BID, price: 36 as never, status: 'live', ownerApprovedRisk: false,
    job: { id: JOB, ref: 'J-1042', status: 'open', buyerId: BUYER },
    seller: { id: SELLER, ownerId: SELLER_USER, displayName: 'patchsmith' },
    negotiationMessages: [],
    ...overrides,
}) as BidContext;

const offer = (overrides: Partial<OfferRow> = {}): OfferRow => ({
    id: OFFER, status: 'sent', price: 32 as never, bidId: BID, jobId: JOB, createdAt: new Date(),
    job: { ref: 'J-1042', buyerId: BUYER, status: 'negotiating' },
    seller: { id: SELLER, ownerId: SELLER_USER, displayName: 'patchsmith' },
    ...overrides,
}) as OfferRow;

describe('NegotiationsService', () => {
    let repo: jest.Mocked<NegotiationsRepository>;
    let service: NegotiationsService;
    let caller = BUYER;

    beforeEach(() => {
        caller = BUYER;
        repo = {
            getBidContext: jest.fn(), createNegotiation: jest.fn().mockResolvedValue({ id: 'm1' }), getNegotiations: jest.fn(),
            getOpenOffer: jest.fn(), createOffer: jest.fn(), getOffer: jest.fn(), getJobOffer: jest.fn(), acceptOffer: jest.fn(), declineOffer: jest.fn(),
        } as unknown as jest.Mocked<NegotiationsRepository>;
        service = new NegotiationsService(repo, { verifySessionToken: jest.fn(async () => caller) } as unknown as AuthService);
    });

    it('opens round 1 for the buyer and moves the job to negotiating', async () => {
        repo.getBidContext.mockResolvedValue(ctx());
        await expect(service.createNegotiation('Bearer t', { bid_id: BID, text: 'Can you do 30?', price: 30 })).resolves.toMatchObject({ round: 1, roundsLeft: 2 });
        expect(repo.createNegotiation.mock.calls[0]![0]).toMatchObject({ sender: 'buyer', round: 1, openJob: true, price: 30 });
    });

    it('lets the seller answer in the same round', async () => {
        caller = SELLER_USER;
        repo.getBidContext.mockResolvedValue(ctx({ negotiationMessages: [{ round: 1, sender: 'buyer', offeredPrice: 30 as never }] }));
        await service.createNegotiation('Bearer t', { bid_id: BID, text: '32 is my lowest.', price: 32 });
        expect(repo.createNegotiation.mock.calls[0]![0]).toMatchObject({ sender: 'seller', round: 1, openJob: false });
    });

    it('stops after three rounds', async () => {
        repo.getBidContext.mockResolvedValue(ctx({ negotiationMessages: [{ round: 3, sender: 'buyer', offeredPrice: null }] }));
        await expect(service.createNegotiation('Bearer t', { bid_id: BID, text: 'One more?' } as never)).rejects.toThrow('3 rounds');
    });

    it('hires at the last seller price', async () => {
        const c = ctx({ negotiationMessages: [{ round: 1, sender: 'seller', offeredPrice: 32 as never }, { round: 1, sender: 'buyer', offeredPrice: 30 as never }] });
        expect(agreedPriceOf(c)).toBe(32);
        repo.getBidContext.mockResolvedValue(c);
        repo.createOffer.mockResolvedValue({ id: OFFER });
        await expect(service.hireSeller('Bearer t', { bid_id: BID } as never)).resolves.toEqual({ message: 'Hire Offer Successfully Sent', id: OFFER, offerSt: 'wait', price: 32 });
    });

    it('refuses to hire a held offer', async () => {
        repo.getBidContext.mockResolvedValue(ctx({ status: 'held' }));
        await expect(service.hireSeller('Bearer t', { bid_id: BID } as never)).rejects.toThrow('held');
    });

    it('refuses a second open hire offer', async () => {
        repo.getBidContext.mockResolvedValue(ctx());
        repo.createOffer.mockResolvedValue(null);
        await expect(service.hireSeller('Bearer t', { bid_id: BID } as never)).rejects.toThrow('already sent a hire offer');
    });

    it('only the seller can accept', async () => {
        repo.getOffer.mockResolvedValue(offer());
        await expect(service.acceptOffer('Bearer t', OFFER)).rejects.toThrow('Only the seller');
    });

    it('the seller accepts and the job becomes agreed', async () => {
        caller = SELLER_USER;
        repo.getOffer.mockResolvedValue(offer());
        repo.acceptOffer.mockResolvedValue(1);
        await expect(service.acceptOffer('Bearer t', OFFER)).resolves.toEqual({ message: 'Hire Offer Successfully Accepted', id: OFFER, offerSt: 'accepted' });
    });

    it('reports the offer state for a job', async () => {
        repo.getJobOffer.mockResolvedValue(offer({ status: 'declined' }));
        await expect(service.getOffer('Bearer t', 'J-1042')).resolves.toMatchObject({ offerSt: 'declined', price: 32, seller: 'patchsmith' });
        repo.getJobOffer.mockResolvedValue(null);
        await expect(service.getOffer('Bearer t', 'J-1042')).resolves.toEqual({ offerSt: '' });
    });
});
