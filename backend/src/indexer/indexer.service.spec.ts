jest.mock('../prisma', () => ({ prisma: {} }));

import { IndexerRepository } from './indexer.repository';
import { Prisma } from '../generated/prisma/client';
import { fundingRefusal, IndexerService, jobRefOf, MOCK_START_BALANCE } from './indexer.service';

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
