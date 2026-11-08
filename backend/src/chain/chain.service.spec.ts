import { Test, TestingModule } from '@nestjs/testing';
import { ChainService } from './chain.service';

describe('ChainService (mock mode)', () => {
    let service: ChainService;

    beforeEach(async () => {
        process.env['AGORA_CHAIN_MODE'] = 'mock';
        const module: TestingModule = await Test.createTestingModule({
            providers: [ChainService],
        }).compile();
        service = module.get<ChainService>(ChainService);
    });

    it('returns a mock tx hash and explorer link for a call', async () => {
        const res = await service.callAs('transaction_agent', 'agents.lumen.testnet', 'fund_job', { job_id: '1' });
        expect(res.tx_hash).toBe('mock-fund_job-1');
        expect(res.explorer_url).toBe('https://testnet.nearblocks.io/txns/mock-fund_job-1');
    });

    it('returns a new id for post_job', async () => {
        const res = await service.callAs('transaction_agent', 'agents.lumen.testnet', 'post_job', { category: 'rust' });
        expect(res.result).toBe('1');
    });

    it('returns the mandate defaults from view', async () => {
        const mandate = await service.view<{ per_job_cap: string; daily_cap: string }>('get_mandate', { account_id: 'lumen.testnet' });
        expect(mandate.per_job_cap).toBe('50000000');
        expect(mandate.daily_cap).toBe('120000000');
    });

    it('rejects an unknown view method', async () => {
        await expect(service.view('get_nothing')).rejects.toThrow('Unknown view method get_nothing');
    });

    it('creates mock account names', async () => {
        const acc = await service.createAccount('3F2A9C10-aaaa');
        expect(acc.account_id).toBe('agora-3f2a9c10.testnet');
        expect(acc.agents_account_id).toBe('agents.agora-3f2a9c10.testnet');
    });

    it('builds an unsigned tx as base64 JSON', async () => {
        const tx = await service.buildUnsignedTx('lumen.testnet', 'withdraw', { amount: '1' }, '1');
        const decoded = JSON.parse(Buffer.from(tx.unsigned_tx_base64, 'base64').toString());
        expect(decoded.method).toBe('withdraw');
        expect(decoded.receiver_id).toBe('agora-market.agora-testnet.testnet');
    });
});
