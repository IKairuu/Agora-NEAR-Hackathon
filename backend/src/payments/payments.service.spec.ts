jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { IndexerRepository } from '../indexer/indexer.repository';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

const BUYER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SELLER = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';

const row = (over: object = {}) => ({
    id: JOB, ref: 'J-1042', onchainId: null, status: 'in_progress', agreedPrice: 32, buyerId: BUYER,
    buyer: { nearAccountId: 'lumen.testnet' }, milestones: [{ amount: 32, status: 'funded', releasedAt: null }], ...over,
});
const refundCtx = (over: object = {}) => ({
    id: JOB, status: 'in_progress', buyerAccount: 'lumen.testnet', milestoneStatus: 'funded', fundedAt: new Date(Date.now() - 60 * 86_400_000), deliveryDays: 2,
    lastAttempt: 3, lastDeliveryStatus: 'rejected', extraAttempts: 0, ...over,
});

describe('PaymentsService', () => {
    let payments: jest.Mocked<PaymentsRepository>;
    let indexer: jest.Mocked<IndexerRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: PaymentsService;
    let caller = BUYER;

    beforeEach(() => {
        caller = BUYER;
        payments = { getPaymentJob: jest.fn().mockResolvedValue(row()) } as unknown as jest.Mocked<PaymentsRepository>;
        indexer = { getRefundContext: jest.fn().mockResolvedValue(refundCtx()) } as unknown as jest.Mocked<IndexerRepository>;
        chain = { callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-refund_milestone-1', explorer_url: 'https://x/tx', ok: true, result: null }) } as unknown as jest.Mocked<ChainService>;
        const auth = { verifySessionToken: jest.fn(async () => caller) } as unknown as AuthService;
        service = new PaymentsService(payments, indexer, auth, chain);
    });

    it('shows the payment with what each button may do and why not', async () => {
        const res = await service.getPayment('Bearer t', 'J-1042');
        expect(res).toMatchObject({ job: 'J-1042', amount: 32, protected: true, attempt: 3, attemptsLeft: 0 });
        expect(res.actions.refund).toEqual({ allowed: true, why: null });
        expect(res.actions.extra_attempt).toEqual({ allowed: true, why: null });
        expect(res.actions.refund_expired.allowed).toBe(true);
        indexer.getRefundContext.mockResolvedValue(refundCtx({ lastAttempt: 1, fundedAt: new Date() }) as never);
        const early = await service.getPayment('Bearer t', 'J-1042');
        expect(early.actions.refund).toEqual({ allowed: false, why: 'Refund is allowed after the last attempt fails' });
        expect(early.actions.refund_expired).toEqual({ allowed: false, why: 'Deadline has not passed' });
        expect(early.attemptsLeft).toBe(2);
    });

    it('tells the seller only the buyer can refund or grant an attempt', async () => {
        caller = SELLER;
        const res = await service.getPayment('Bearer t', 'J-1042');
        expect(res.actions.refund).toEqual({ allowed: false, why: 'Only the buyer can do this' });
        expect(res.actions.extra_attempt.allowed).toBe(false);
    });

    it('hides a job from someone who is not on it', async () => {
        payments.getPaymentJob.mockResolvedValue(null);
        await expect(service.getPayment('Bearer t', 'J-1042')).rejects.toThrow('Job not found');
        await expect(service.getPayment('Bearer t', 'nope')).rejects.toThrow('Job id is not valid');
    });

    it('refunds and grants an attempt as the buyer', async () => {
        await expect(service.refund('Bearer t', { job_id: 'J-1042' })).resolves.toMatchObject({ message: 'Payment Successfully Refunded', tx_hash: 'mock-refund_milestone-1' });
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'lumen.testnet', 'refund_milestone', { job_id: 'J-1042' }]);
        await service.grantAttempt('Bearer t', { job_id: 'J-1042' });
        expect(chain.callAs.mock.calls[1]).toEqual(['owner', 'lumen.testnet', 'grant_attempt', { job_id: 'J-1042' }]);
    });

    it('refuses a refund from the seller', async () => {
        caller = SELLER;
        await expect(service.refund('Bearer t', { job_id: 'J-1042' })).rejects.toThrow('Only the buyer can do this');
        expect(chain.callAs.mock.calls).toHaveLength(0);
    });

    it('lets either side call refund_expired with the platform signer and the numeric job id', async () => {
        caller = SELLER;
        payments.getPaymentJob.mockResolvedValue(row({ onchainId: 1790000001n }) as never);
        await service.refundExpired('Bearer t', { job_id: 'J-1042' });
        expect(chain.callAs.mock.calls[0]).toEqual(['platform', 'agora-testnet.testnet', 'refund_expired', { job_id: '1790000001' }]);
    });
});
