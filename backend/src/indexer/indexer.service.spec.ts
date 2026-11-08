jest.mock('../prisma', () => ({ prisma: {} }));

import { IndexerRepository } from './indexer.repository';
import { IndexerService, jobRefOf, MOCK_START_BALANCE } from './indexer.service';

const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';

describe('IndexerService (mock)', () => {
    let repo: jest.Mocked<IndexerRepository>;
    let service: IndexerService;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            recordTx: jest.fn().mockResolvedValue({ id: 't' }), fundJob: jest.fn().mockResolvedValue({ jobId: JOB, amount: 32 }),
            refundJob: jest.fn().mockResolvedValue({ jobId: JOB, amount: 32 }), releaseJob: jest.fn().mockResolvedValue({ jobId: JOB }),
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
});
