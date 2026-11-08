jest.mock('../prisma', () => ({ prisma: {} }));

import { bondReturnedFor, IndexerRepository } from './indexer.repository';
import { Prisma } from '../generated/prisma/client';
import { bondNeeded, disputeRefusal, ESCALATION_WINDOW_MS, fundingRefusal, IndexerService, jobRefOf, MOCK_START_BALANCE, settlementOf } from './indexer.service';

const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const D = (n: number) => new Prisma.Decimal(n);
const ctx = (over: Record<string, unknown> = {}, buyer: Record<string, unknown> = {}) => ({
    id: JOB, status: 'agreed', category: 'rust', agreedPrice: D(20), buyerId: 'buyer',
    buyer: { nearAccountId: 'lumen.testnet', mandate: null, approvedSellers: [], ...buyer },
    seller: { id: 'seller-1', nearAccountId: 'patchsmith.testnet' },
    acceptedBid: { fraudScore: 6, priceCheck: 'cleared', ownerApprovedRisk: false },
    ...over,
}) as never;
const mandate = (over: object = {}) => ({ perJobCap: D(50), dailyCap: D(120), newSellerCap: D(25), allowedCategories: ['rust', 'fe', 'tests'], strictSellers: false, paused: false, ...over });

describe('IndexerService (mock)', () => {
    let repo: jest.Mocked<IndexerRepository>;
    let service: IndexerService;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            recordTx: jest.fn().mockResolvedValue({ id: 't' }), fundJob: jest.fn().mockResolvedValue({ jobId: JOB, amount: 32 }),
            refundJob: jest.fn().mockResolvedValue({ jobId: JOB, amount: 32 }), releaseJob: jest.fn().mockResolvedValue({ jobId: JOB }),
            getFundingContext: jest.fn().mockResolvedValue(ctx()), getBalance: jest.fn().mockResolvedValue(null), getSettledJobs: jest.fn().mockResolvedValue(0),
            findOwner: jest.fn().mockResolvedValue({ id: 'buyer', nearAccountId: 'lumen.testnet' }), deposit: jest.fn(), withdraw: jest.fn().mockResolvedValue(1),
            setMandate: jest.fn(), setPaused: jest.fn(),
        } as unknown as jest.Mocked<IndexerRepository>;
        service = new IndexerService(repo);
    });

    afterEach(() => { process.env = { ...env }; });

    it('reads every job id form the backend sends', () => {
        expect(jobRefOf('J-1042')).toEqual({ ref: 'J-1042' });
        expect(jobRefOf('17')).toEqual({ onchainId: 17n });
        expect(jobRefOf(17)).toEqual({ onchainId: 17n });
        expect(jobRefOf(JOB)).toEqual({ id: JOB });
        expect(jobRefOf(undefined)).toBeNull();
        expect(jobRefOf('drop table')).toBeNull();
    });

    it('records every call and funds the job on fund_job', async () => {
        await expect(service.onMockCall({ signer: 'agents.lumen.testnet', method: 'fund_job', args: { job_id: 'J-1042' }, txHash: 'mock-fund_job-9' })).resolves.toEqual({ jobId: JOB, amount: 32 });
        expect(repo.recordTx.mock.calls[0]?.[0]).toMatchObject({ txHash: 'mock-fund_job-9', signer: 'agents.lumen.testnet', method: 'fund_job', ok: true, jobKey: { ref: 'J-1042' } });
        expect(repo.fundJob.mock.calls[0]).toEqual([{ ref: 'J-1042' }, 'mock-fund_job-9', MOCK_START_BALANCE]);
    });

    it('refunds on refund_milestone and refund_expired', async () => {
        await service.onMockCall({ signer: 'agents.lumen.testnet', method: 'refund_milestone', args: { job_id: '7' }, txHash: 'mock-r-1' });
        await service.onMockCall({ signer: 'anyone.testnet', method: 'refund_expired', args: { job_id: '7' }, txHash: 'mock-r-2' });
        expect(repo.refundJob.mock.calls).toEqual([[{ onchainId: 7n }, 'mock-r-1'], [{ onchainId: 7n }, 'mock-r-2']]);
    });

    it('only records calls that move no money', async () => {
        await expect(service.onMockCall({ signer: 'patchsmith.testnet', method: 'submit_delivery', args: { job_id: 'J-1042', commit_hash: 'abc' }, txHash: 'mock-s-1' })).resolves.toBeNull();
        await expect(service.onMockCall({ signer: 'agora-testnet.testnet', method: 'register_seller', args: { account_id: 'x.testnet' }, txHash: 'mock-g-1' })).resolves.toBeNull();
        expect(repo.recordTx.mock.calls).toHaveLength(2);
        expect(repo.recordTx.mock.calls[1]?.[0].jobKey).toBeNull();
        expect(repo.fundJob.mock.calls).toHaveLength(0);
        expect(repo.refundJob.mock.calls).toHaveLength(0);
    });

    it('releases with the 2% fee to the DAO account', async () => {
        await service.onMockRelease(JOB, 'mock-release-1');
        expect(repo.releaseJob.mock.calls[0]).toEqual([{ id: JOB }, 'mock-release-1', 200, 'agora-dao.sputnikv2.testnet']);
    });

    it('records a refused fund_job as rejected and throws the contract message', async () => {
        repo.getFundingContext.mockResolvedValue(ctx({ agreedPrice: D(32) }));
        await expect(service.onMockCall({ signer: 'agents.lumen.testnet', method: 'fund_job', args: { job_id: 'J-1042' }, txHash: 'mock-f-1' })).rejects.toThrow('Contract refused fund_job: Over new-seller cap');
        expect(repo.recordTx.mock.calls[0]?.[0]).toMatchObject({ ok: false, error: 'Over new-seller cap' });
        expect(repo.fundJob.mock.calls).toHaveLength(0);
    });

    it('turns USDC base units into amounts for deposit, withdraw and set_mandate', async () => {
        await service.onMockCall({ signer: 'lumen.testnet', method: 'deposit', args: { amount: '10000000' }, txHash: 'mock-d-1' });
        expect(repo.deposit.mock.calls[0]).toEqual(['lumen.testnet', 'buyer', 10, MOCK_START_BALANCE]);
        repo.getBalance.mockResolvedValue({ available: D(5), escrowed: D(0), spentToday: D(0), dayStarted: null });
        await expect(service.onMockCall({ signer: 'lumen.testnet', method: 'withdraw', args: { amount: '6000000' }, txHash: 'mock-w-1' })).rejects.toThrow('Not enough free balance');
        await service.onMockCall({ signer: 'lumen.testnet', method: 'withdraw', args: { amount: '5000000' }, txHash: 'mock-w-2' });
        expect(repo.withdraw.mock.calls[0]).toEqual(['lumen.testnet', 5]);
        await service.onMockCall({ signer: 'lumen.testnet', method: 'set_mandate', args: { per_job_cap: '40000000', daily_cap: '100000000', new_seller_cap: '30000000', review_timeout_hours: 6, categories: ['rust'], strict: true, approved_sellers: [] }, txHash: 'mock-m-1' });
        expect(repo.setMandate.mock.calls[0]).toEqual(['buyer', { perJobCap: 40, dailyCap: 100, newSellerCap: 30, reviewWindowHours: 6, allowedCategories: ['rust'], strictSellers: true }, [], 'mock-m-1']);
        await service.onMockCall({ signer: 'agents.lumen.testnet', method: 'pause', args: {}, txHash: 'mock-p-1' });
        expect(repo.setPaused.mock.calls[0]).toEqual(['buyer', true, 'agents.lumen.testnet', 'mock-p-1']);
    });
});

describe('fundingRefusal: the nine checks in contract order', () => {
    const fresh = { available: D(120), spentToday: D(0), dayStarted: new Date() };
    it.each([
        [ctx({ status: 'open' }), fresh, 0, 'Job is not accepted'],
        [ctx({}, { mandate: mandate({ paused: true }) }), fresh, 0, 'Paused'],
        [ctx({ agreedPrice: D(60) }), fresh, 5, 'Over per-job cap'],
        [ctx({ agreedPrice: D(30) }), { ...fresh, spentToday: D(100) }, 5, 'Over daily cap'],
        [ctx({ category: 'scripts' }), fresh, 5, 'Category not allowed'],
        [ctx({}, { mandate: mandate({ strictSellers: true }) }), fresh, 5, 'Seller not approved'],
        [ctx({ acceptedBid: { fraudScore: 80, priceCheck: 'cleared', ownerApprovedRisk: false } }), fresh, 5, 'Bid flagged'],
        [ctx({ acceptedBid: { fraudScore: 6, priceCheck: 'held', ownerApprovedRisk: false } }), fresh, 5, 'Bid held by price check'],
        [ctx({ agreedPrice: D(32) }), fresh, 2, 'Over new-seller cap'],
        [ctx(), { ...fresh, available: D(10) }, 5, 'Not enough free balance'],
    ])('refuses %#', (job, balance, settled, msg) => {
        expect(fundingRefusal(job, balance, settled as number, MOCK_START_BALANCE)).toBe(msg);
    });

    it('passes a job inside every limit, counting yesterday as a new day', () => {
        expect(fundingRefusal(ctx(), { available: D(120), spentToday: D(115), dayStarted: new Date(Date.now() - 86_400_000 * 2) }, 0, MOCK_START_BALANCE)).toBeNull();
        expect(fundingRefusal(ctx({ acceptedBid: { fraudScore: 6, priceCheck: 'held', ownerApprovedRisk: true } }), null, 5, MOCK_START_BALANCE)).toBeNull();
    });
});

const NOW = new Date('2026-11-09T12:00:00Z').getTime();
const DAO = 'agora-dao.sputnikv2.testnet';
const dctx = (over: Record<string, unknown> = {}, dispute: Record<string, unknown> | null = null, deliveries = 1) => ({
    id: JOB, status: 'delivered', agreedPrice: D(20), buyerId: 'buyer',
    buyer: { nearAccountId: 'lumen.testnet' },
    seller: { id: 'seller-1', nearAccountId: 'patchsmith.testnet', ownerId: 'seller-owner' },
    milestones: [{
        id: 'm0', amount: D(20), _count: { deliveries },
        disputes: dispute ? [{ id: 'dsp', status: 'recheck', recheckOutcome: null, recheckAt: null, escalatedAt: null, claim: null, bondAmount: null, ...dispute }] : [],
    }],
    ...over,
}) as never;
const call = (method: string, signer: string, args: Record<string, unknown>) => ({ method, signer, args });
const bond = (amount: string, job = 'J-1042') => ({ receiver_id: 'agora-market.agora-testnet.testnet', amount, msg: `dispute_bond:${job}` });

describe('disputeRefusal: contract messages', () => {
    const decided = { recheckOutcome: 'release', recheckAt: new Date(NOW - 3_600_000) };
    it.each([
        [call('open_dispute', 'stranger.testnet', { reason: 'x' }), dctx(), 'Only the buyer or seller can open a dispute'],
        [call('open_dispute', 'lumen.testnet', { reason: 'x' }), dctx({ status: 'funded' }, null, 0), 'Only a delivered job can be disputed'],
        [call('open_dispute', 'lumen.testnet', { reason: 'x' }), dctx({ status: 'released' }), 'Only a delivered job can be disputed'],
        [call('open_dispute', 'lumen.testnet', { reason: '  ' }), dctx(), 'Reason is required'],
        [call('open_dispute', 'lumen.testnet', { reason: 'x'.repeat(501) }), dctx(), 'Reason is too long'],
        [call('open_dispute', 'lumen.testnet', { reason: 'x' }), dctx({}, {}), 'This job was already disputed'],
        [call('ft_transfer_call', 'lumen.testnet', { amount: '1000000', msg: 'hello' }), dctx(), 'Unsupported deposit message'],
        [call('ft_transfer_call', 'lumen.testnet', bond('1000000')), dctx(), 'Job is not disputed'],
        [call('ft_transfer_call', 'stranger.testnet', bond('1000000')), dctx({ status: 'disputed' }, decided), 'Only the buyer or seller can escalate'],
        [call('ft_transfer_call', 'lumen.testnet', bond('1000000')), dctx({ status: 'disputed' }, {}), 'Wait for the re-check result'],
        [call('ft_transfer_call', 'lumen.testnet', bond('1000000')), dctx({ status: 'disputed' }, { ...decided, recheckAt: new Date(NOW - ESCALATION_WINDOW_MS) }), 'The escalation window has closed'],
        [call('ft_transfer_call', 'patchsmith.testnet', bond('1000000')), dctx({ status: 'disputed' }, decided), 'The re-check already agrees with you'],
        [call('ft_transfer_call', 'lumen.testnet', bond('999999')), dctx({ status: 'disputed' }, decided), 'Bond is below 5% of the price (minimum 1 USDC)'],
        [call('ft_transfer_call', 'lumen.testnet', bond('1000000')), dctx({ status: 'disputed' }, { ...decided, escalatedAt: new Date(NOW) }), 'Dispute is already escalated'],
        [call('resolve_dispute', 'lumen.testnet', { outcome: 'refund' }), dctx({ status: 'disputed' }, decided), 'Only the DAO can resolve a dispute'],
        [call('resolve_dispute', DAO, { outcome: 'refund' }), dctx({ status: 'disputed' }, decided), 'The dispute was not escalated'],
        [call('resolve_dispute', DAO, { outcome: 'split', seller_share_bps: 10_000 }), dctx({ status: 'disputed' }, { ...decided, escalatedAt: new Date(NOW) }), 'A split needs a share between 1 and 9999'],
        [call('resolve_dispute', DAO, { outcome: 'burn' }), dctx({ status: 'disputed' }, { ...decided, escalatedAt: new Date(NOW) }), 'Outcome must be release, refund or split'],
        [call('finalize_default', 'anyone.testnet', {}), dctx({ status: 'disputed' }, {}), 'The re-check has no result yet'],
        [call('finalize_default', 'anyone.testnet', {}), dctx({ status: 'disputed' }, decided), 'Wait 72 hours before finalizing'],
        [call('finalize_default', 'anyone.testnet', {}), dctx({ status: 'disputed' }, { ...decided, recheckAt: new Date(NOW - ESCALATION_WINDOW_MS), escalatedAt: new Date(NOW - 60_000) }), 'Wait 72 hours before finalizing'],
    ])('refuses %#', (c, ctx, msg) => {
        expect(disputeRefusal(c, ctx, NOW, DAO, 120)).toBe(msg);
    });

    it('allows the right calls at the right time', () => {
        expect(disputeRefusal(call('open_dispute', 'agents.lumen.testnet', { reason: 'tests wrong' }), dctx(), NOW, DAO, 0)).toBeNull();
        expect(disputeRefusal(call('open_dispute', 'patchsmith.testnet', { reason: 'tests wrong' }), dctx({ status: 'in_progress' }), NOW, DAO, 0)).toBeNull();
        const decided = { recheckOutcome: 'release', recheckAt: new Date(NOW - 3_600_000) };
        expect(disputeRefusal(call('ft_transfer_call', 'lumen.testnet', bond('1000000')), dctx({ status: 'disputed' }, decided), NOW, DAO, 5)).toBeNull();
        expect(disputeRefusal(call('ft_transfer_call', 'lumen.testnet', bond('1000000')), dctx({ status: 'disputed' }, decided), NOW, DAO, 0.5)).toBe('Not enough free balance');
        expect(disputeRefusal(call('resolve_dispute', DAO, { outcome: 'split', seller_share_bps: 7000 }), dctx({ status: 'disputed' }, { ...decided, escalatedAt: new Date(NOW) }), NOW, DAO, 0)).toBeNull();
        expect(disputeRefusal(call('finalize_default', 'x.testnet', {}), dctx({ status: 'disputed' }, { ...decided, recheckAt: new Date(NOW - ESCALATION_WINDOW_MS) }), NOW, DAO, 0)).toBeNull();
    });
});

describe('dispute money math', () => {
    it('sets the bond at 5% of the price with a 1 USDC floor', () => {
        expect(bondNeeded(20)).toBe(1);
        expect(bondNeeded(50)).toBe(2.5);
        expect(bondNeeded('32.5')).toBe(1.625);
    });

    it('settles release, refund and split with the fee only on the seller share', () => {
        const release = settlementOf(32, 10_000, 200);
        expect([Number(release.sellerAmount), Number(release.buyerAmount), Number(release.fee)]).toEqual([31.36, 0, 0.64]);
        const refund = settlementOf(32, 0, 200);
        expect([Number(refund.sellerAmount), Number(refund.buyerAmount), Number(refund.fee)]).toEqual([0, 32, 0]);
        const split = settlementOf(20, 7000, 200);
        expect([Number(split.sellerAmount), Number(split.buyerAmount), Number(split.fee)]).toEqual([13.72, 6, 0.28]);
        const odd = settlementOf('0.000003', 5000, 200);
        expect([odd.sellerAmount.toString(), odd.buyerAmount.toString(), odd.fee.toString()]).toEqual(['0.000001', '0.000002', '0']);
    });

    it('returns the bond only when the DAO grants the claim or splits', () => {
        expect(bondReturnedFor(D(1), 'refund', 'refund', 'dao', 'lumen.testnet')).toBe(true);
        expect(bondReturnedFor(D(1), 'refund', 'split', 'dao', 'lumen.testnet')).toBe(true);
        expect(bondReturnedFor(D(1), 'refund', 'release', 'dao', 'lumen.testnet')).toBe(false);
        expect(bondReturnedFor(D(1), 'refund', 'refund', 'default', 'lumen.testnet')).toBe(false);
        expect(bondReturnedFor(null, null, 'refund', 'dao', null)).toBe(false);
    });
});

describe('IndexerService dispute events (mock)', () => {
    let repo: jest.Mocked<IndexerRepository>;
    let service: IndexerService;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            recordTx: jest.fn().mockResolvedValue({ id: 't' }), getDisputeContext: jest.fn().mockResolvedValue(dctx()), getBalance: jest.fn().mockResolvedValue(null),
            openDispute: jest.fn().mockResolvedValue({ disputeId: 'dsp' }), escalateDispute: jest.fn().mockResolvedValue({ disputeId: 'dsp' }),
            settleDispute: jest.fn().mockResolvedValue({ disputeId: 'dsp' }),
        } as unknown as jest.Mocked<IndexerRepository>;
        service = new IndexerService(repo);
        service.now = () => NOW;
    });

    afterEach(() => { process.env = { ...env }; });

    it('opens a dispute as the buyer side', async () => {
        await service.onMockCall({ signer: 'lumen.testnet', method: 'open_dispute', args: { job_id: 'J-1042', reason: 'Tests were wrong' }, txHash: 'mock-od-1' });
        expect(repo.openDispute.mock.calls[0]).toEqual([{ ref: 'J-1042' }, 'buyer', 'Tests were wrong', new Date(NOW)]);
        expect(repo.recordTx.mock.calls[0]?.[0]).toMatchObject({ method: 'open_dispute', ok: true });
    });

    it('escalates with the bond from the transfer message and records a refusal', async () => {
        repo.getDisputeContext.mockResolvedValue(dctx({ status: 'disputed' }, { recheckOutcome: 'release', recheckAt: new Date(NOW - 1000) }));
        await service.onMockCall({ signer: 'lumen.testnet', method: 'ft_transfer_call', args: bond('1500000'), txHash: 'mock-b-1' });
        expect(repo.escalateDispute.mock.calls[0]?.[0]).toEqual({ ref: 'J-1042' });
        expect(repo.escalateDispute.mock.calls[0]?.[1]).toMatchObject({ signer: 'lumen.testnet', party: 'buyer', claim: 'refund', bond: 1.5, startBalance: MOCK_START_BALANCE });
        service.now = () => NOW + ESCALATION_WINDOW_MS;
        await expect(service.onMockCall({ signer: 'lumen.testnet', method: 'ft_transfer_call', args: bond('1500000'), txHash: 'mock-b-2' })).rejects.toThrow('Contract refused ft_transfer_call: The escalation window has closed');
        expect(repo.recordTx.mock.calls[1]?.[0]).toMatchObject({ ok: false, error: 'The escalation window has closed', jobKey: { ref: 'J-1042' } });
        expect(repo.escalateDispute.mock.calls).toHaveLength(1);
    });

    it('settles a DAO split with the fee on the seller share', async () => {
        repo.getDisputeContext.mockResolvedValue(dctx({ status: 'disputed' }, { recheckOutcome: 'refund', recheckAt: new Date(NOW - 1000), escalatedAt: new Date(NOW - 500), claim: 'release', bondAmount: D(1) }));
        await service.onMockCall({ signer: DAO, method: 'resolve_dispute', args: { job_id: 'J-1042', outcome: 'split', seller_share_bps: 7000 }, txHash: 'mock-rd-1' });
        const s = repo.settleDispute.mock.calls[0]![1];
        expect(s).toMatchObject({ outcome: 'split', sellerShareBps: 7000, by: 'dao', daoAccount: DAO, txHash: 'mock-rd-1' });
        expect([Number(s.sellerAmount), Number(s.buyerAmount), Number(s.fee)]).toEqual([13.72, 6, 0.28]);
    });

    it('finalizes on the re-check result after 72 hours', async () => {
        process.env['AGORA_FEE_BPS'] = '100';
        repo.getDisputeContext.mockResolvedValue(dctx({ status: 'disputed' }, { recheckOutcome: 'release', recheckAt: new Date(NOW - ESCALATION_WINDOW_MS) }));
        await service.onMockCall({ signer: 'agora-testnet.testnet', method: 'finalize_default', args: { job_id: 'J-1042' }, txHash: 'mock-fd-1' });
        const s = repo.settleDispute.mock.calls[0]![1];
        expect(s).toMatchObject({ outcome: 'release', sellerShareBps: 10_000, by: 'default' });
        expect([Number(s.sellerAmount), Number(s.fee)]).toEqual([19.8, 0.2]);
    });
});
