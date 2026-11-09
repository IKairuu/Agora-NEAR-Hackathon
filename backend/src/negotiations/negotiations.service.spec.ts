jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
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
    job: { id: JOB, ref: 'J-1042', buyerId: BUYER, status: 'negotiating', onchainId: null, buyer: { nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet' } },
    seller: { id: SELLER, ownerId: SELLER_USER, displayName: 'patchsmith' },
    ...overrides,
}) as OfferRow;

describe('NegotiationsService', () => {
    let repo: jest.Mocked<NegotiationsRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: NegotiationsService;
    let caller = BUYER;

    beforeEach(() => {
        caller = BUYER;
        repo = {
            getBidContext: jest.fn(), createNegotiation: jest.fn().mockResolvedValue({ id: 'm1' }), getNegotiations: jest.fn(),
            getOpenOffer: jest.fn(), createOffer: jest.fn(), getOffer: jest.fn(), getJobOffer: jest.fn(), acceptOffer: jest.fn(), declineOffer: jest.fn(), setBuyerAccounts: jest.fn(),
            getAcceptTerms: jest.fn().mockResolvedValue({ bid: { id: BID, onchainId: null, deliveryDays: 2 }, spec: { specHash: 'ab'.repeat(32), holdoutHash: null } }),
        } as unknown as jest.Mocked<NegotiationsRepository>;
        chain = {
            createAccount: jest.fn().mockResolvedValue({ account_id: 'agora-buyer.testnet', agents_account_id: 'agents.agora-buyer.testnet' }),
            callAs: jest.fn(async (_r: string, _a: string, method: string) => ({ tx_hash: `mock-${method}-1`, explorer_url: '', ok: true, result: null })),
        } as unknown as jest.Mocked<ChainService>;
        service = new NegotiationsService(repo, { verifySessionToken: jest.fn(async () => caller) } as unknown as AuthService, chain);
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

    it('the seller accepts, the buyer agent accepts on chain and then funds', async () => {
        caller = SELLER_USER;
        repo.getOffer.mockResolvedValue(offer());
        repo.acceptOffer.mockResolvedValue(1);
        await expect(service.acceptOffer('Bearer t', OFFER)).resolves.toEqual({
            message: 'Hire Offer Successfully Accepted', id: OFFER, offerSt: 'accepted',
            accepted: true, acceptTx: 'mock-accept_offer-1', acceptError: null, funded: true, fundTx: 'mock-fund_job-1', fundError: null,
        });
        expect(chain.callAs.mock.calls.map((c) => c[2])).toEqual(['accept_offer', 'fund_job']);
        const [role, signer, , args] = chain.callAs.mock.calls[0]!;
        expect([role, signer]).toEqual(['transaction_agent', 'agents.lumen.testnet']);
        expect(args).toMatchObject({ job_id: 'J-1042', bid_id: BID, price: '32000000', spec_hash: 'ab'.repeat(32), holdout_hash: 'none', attempts: 3 });
        expect(BigInt(args['deadline'] as string)).toBeGreaterThan(BigInt(Date.now() + 4 * 86_400_000) * 1_000_000n);
        expect(chain.callAs.mock.calls[1]).toEqual(['transaction_agent', 'agents.lumen.testnet', 'fund_job', { job_id: 'J-1042' }]);
        expect(repo.getAcceptTerms.mock.calls[0]).toEqual([JOB, BID]);
        expect(chain.createAccount.mock.calls).toHaveLength(0);
    });

    it('sends the on-chain job and bid ids once they exist', async () => {
        caller = SELLER_USER;
        repo.getOffer.mockResolvedValue(offer({ job: { id: JOB, ref: 'J-1042', buyerId: BUYER, status: 'negotiating', onchainId: 7n, buyer: { nearAccountId: null, agentsAccountId: null } } } as never));
        repo.getAcceptTerms.mockResolvedValue({ bid: { id: BID, onchainId: 9n, deliveryDays: null }, spec: { specHash: 'cd'.repeat(32), holdoutHash: 'ef'.repeat(32) } } as never);
        repo.acceptOffer.mockResolvedValue(1);
        await service.acceptOffer('Bearer t', OFFER);
        expect(repo.setBuyerAccounts.mock.calls[0]).toEqual([BUYER, 'agora-buyer.testnet', 'agents.agora-buyer.testnet']);
        expect(chain.callAs.mock.calls[0]![3]).toMatchObject({ job_id: '7', bid_id: '9', holdout_hash: 'ef'.repeat(32) });
        expect(chain.callAs.mock.calls[1]).toEqual(['transaction_agent', 'agents.agora-buyer.testnet', 'fund_job', { job_id: '7' }]);
    });

    it('skips funding when accept_offer is refused and keeps the accept', async () => {
        caller = SELLER_USER;
        repo.getOffer.mockResolvedValue(offer());
        repo.acceptOffer.mockResolvedValue(1);
        chain.callAs.mockRejectedValueOnce(new Error('Contract refused accept_offer: Price must be positive and not above the bid'));
        await expect(service.acceptOffer('Bearer t', OFFER)).resolves.toMatchObject({
            offerSt: 'accepted', accepted: false, funded: false, fundError: 'Contract refused accept_offer: Price must be positive and not above the bid',
        });
        expect(chain.callAs.mock.calls).toHaveLength(1);
    });

    it('keeps the accept when funding is refused', async () => {
        caller = SELLER_USER;
        repo.getOffer.mockResolvedValue(offer());
        repo.acceptOffer.mockResolvedValue(1);
        chain.callAs.mockResolvedValueOnce({ tx_hash: 'mock-accept_offer-1', explorer_url: '', ok: true, result: null }).mockRejectedValueOnce(new Error('Over per-job cap'));
        await expect(service.acceptOffer('Bearer t', OFFER)).resolves.toMatchObject({ offerSt: 'accepted', accepted: true, funded: false, fundError: 'Over per-job cap' });
    });

    it('reports the offer state for a job', async () => {
        repo.getJobOffer.mockResolvedValue(offer({ status: 'declined' }));
        await expect(service.getOffer('Bearer t', 'J-1042')).resolves.toMatchObject({ offerSt: 'declined', price: 32, seller: 'patchsmith' });
        repo.getJobOffer.mockResolvedValue(null);
        await expect(service.getOffer('Bearer t', 'J-1042')).resolves.toEqual({ offerSt: '' });
    });
});
