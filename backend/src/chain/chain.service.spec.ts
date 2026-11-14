jest.mock('../prisma', () => ({ prisma: {} }));

const signAndSendTransaction = jest.fn();
const callFunction = jest.fn();
const viewTransactionStatus = jest.fn();
const accountCtor = jest.fn();
const providerCtor = jest.fn();
const fromSecretKey = jest.fn((key: string) => ({ key }));
const functionCall = jest.fn((methodName: string, args: object, gas: bigint, deposit: bigint) => ({ functionCall: { methodName, args, gas, deposit } }));

jest.mock('near-api-js', () => ({
    Account: jest.fn().mockImplementation((...a: unknown[]) => {
        accountCtor(...a);
        return { signAndSendTransaction };
    }),
    JsonRpcProvider: jest.fn().mockImplementation((...a: unknown[]) => {
        providerCtor(...a);
        return { callFunction, viewTransactionStatus };
    }),
    KeyPairSigner: { fromSecretKey: (key: string) => fromSecretKey(key) },
    actions: { functionCall: (m: string, a: object, g: bigint, d: bigint) => functionCall(m, a, g, d) },
    teraToGas: (t: number) => BigInt(t) * 1_000_000_000_000n,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { IndexerService } from '../indexer/indexer.service';
import { ChainRepository } from './chain.repository';
import { ChainService, deadlineIn, decodeSuccessValue, functionCallOf, panicMessage, parseOutcome } from './chain.service';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64');
const KEY = 'ed25519:3D4YudUahN1nawWogh8pAKSj92sUNMdbZGjn7kERKzYoTy8tnFQuwoGUC51DowKqorvkr2pytJSnwuSbsNVfqygr';

const build = async (getVaultSecret: jest.Mock = jest.fn().mockResolvedValue(null)) => {
    const onMockCall = jest.fn().mockResolvedValue(null);
    const recordRealCall = jest.fn().mockResolvedValue({ id: 't' });
    const applyCall = jest.fn().mockResolvedValue(null);
    const hasTx = jest.fn().mockResolvedValue(false);
    const partiesOf = jest.fn().mockResolvedValue(['lumen.testnet', 'patchsmith.testnet']);
    const syncBalance = jest.fn().mockResolvedValue({ accountId: 'x' });
    const module: TestingModule = await Test.createTestingModule({
        providers: [
            ChainService,
            { provide: IndexerService, useValue: { onMockCall, recordRealCall, applyCall, hasTx, partiesOf, syncBalance } },
            { provide: ChainRepository, useValue: { getVaultSecret } },
        ],
    }).compile();
    return { service: module.get<ChainService>(ChainService), onMockCall, recordRealCall, getVaultSecret, applyCall, hasTx, partiesOf, syncBalance };
};

describe('ChainService (mock mode)', () => {
    let service: ChainService;
    let onMockCall: jest.Mock;
    const env = { ...process.env };

    beforeEach(async () => {
        process.env['AGORA_CHAIN_MODE'] = 'mock';
        ({ service, onMockCall } = await build());
    });

    afterEach(() => { process.env = { ...env }; });

    it('returns a mock tx hash and explorer link for a call', async () => {
        const res = await service.callAs('transaction_agent', 'agents.lumen.testnet', 'fund_job', { job_id: '1' });
        expect(res.tx_hash).toMatch(/^mock-fund_job-\d+$/);
        expect(res.ok).toBe(true);
        expect(res.explorer_url).toBe(`https://testnet.nearblocks.io/txns/${res.tx_hash}`);
        expect(onMockCall).toHaveBeenCalledWith({ signer: 'agents.lumen.testnet', method: 'fund_job', args: { job_id: '1' }, txHash: res.tx_hash });
    });

    it('returns new ids for post_job and place_bid', async () => {
        const res = await service.callAs('transaction_agent', 'agents.lumen.testnet', 'post_job', { category: 'rust' });
        const bid = await service.callAs('owner', 'patchsmith.testnet', 'place_bid', { job_id: res.result });
        const accept = await service.callAs('transaction_agent', 'agents.lumen.testnet', 'accept_offer', { job_id: res.result });
        expect(Number(res.result)).toBeGreaterThan(1_700_000_000);
        expect(Number(bid.result)).toBe(Number(res.result) + 1);
        expect(accept.result).toBeNull();
        expect(onMockCall.mock.calls.map((c: [{ method: string }]) => c[0].method)).toEqual(['post_job', 'place_bid', 'accept_offer']);
    });

    it('passes a mock refusal through', async () => {
        onMockCall.mockRejectedValueOnce(new Error('Contract refused accept_offer: Self-dealing: seller is the buyer'));
        await expect(service.callAs('transaction_agent', 'agents.lumen.testnet', 'accept_offer', { job_id: '1' })).rejects.toThrow('Self-dealing');
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

    it('keeps the database balance in mock mode', async () => {
        const { service, syncBalance } = await build();
        await expect(service.liveBalance('lumen.testnet')).resolves.toBeNull();
        await expect(service.refreshBalance('lumen.testnet')).resolves.toBe(false);
        expect(syncBalance.mock.calls).toHaveLength(0);
    });

    it('does not index by hash in mock mode, because the mock already applied the call', async () => {
        const { service, applyCall } = await build();
        await expect(service.indexTx('ANY1', 'x.testnet')).resolves.toMatchObject({ indexed: false });
        expect(viewTransactionStatus.mock.calls).toHaveLength(0);
        expect(applyCall.mock.calls).toHaveLength(0);
    });

    it('never touches near-api-js in mock mode', async () => {
        await service.callAs('platform', 'agora-testnet.testnet', 'register_seller', { account_id: 'x.testnet' }, '1');
        expect(signAndSendTransaction.mock.calls).toHaveLength(0);
        expect(accountCtor.mock.calls).toHaveLength(0);
    });
});

describe('ChainService (real mode)', () => {
    const env = { ...process.env };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env['AGORA_CHAIN_MODE'] = 'real';
        process.env['NEAR_NETWORK'] = 'testnet';
        process.env['AGORA_CONTRACT_ID'] = 'agora-market.agora-testnet.testnet';
        process.env['AGORA_USDC_CONTRACT_ID'] = 'usdc.fakes.testnet';
        delete process.env['NEAR_RPC_URL'];
        delete process.env['AGORA_PLATFORM_PRIVATE_KEY'];
    });

    afterEach(() => { process.env = { ...env }; });

    const ok = (value: unknown, hash = 'HASH1') => ({
        status: { SuccessValue: b64(value) },
        transaction: { hash },
        transaction_outcome: { id: hash },
        receipts_outcome: [{ outcome: { status: { SuccessValue: b64(value) } } }],
    });

    it('signs post_job as the buyer agent with the key from Vault and decodes the job id', async () => {
        const { service, getVaultSecret, recordRealCall } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockResolvedValue(ok('17'));
        const res = await service.callAs('transaction_agent', 'agents.lumen.testnet', 'post_job', { category: 'rust', budget_hint: '40000000', spec_hash: 'ab', deadline: '1' });
        expect(res).toEqual({ tx_hash: 'HASH1', explorer_url: 'https://testnet.nearblocks.io/txns/HASH1', ok: true, result: '17' });
        expect(getVaultSecret.mock.calls[0]).toEqual(['near_key:agents.lumen.testnet']);
        expect(fromSecretKey.mock.calls[0]).toEqual([KEY]);
        expect(accountCtor.mock.calls[0]![0]).toBe('agents.lumen.testnet');
        expect(providerCtor.mock.calls[0]).toEqual([{ url: 'https://test.rpc.fastnear.com' }]);
        expect(functionCall.mock.calls[0]).toEqual(['post_job', { category: 'rust', budget_hint: '40000000', spec_hash: 'ab', deadline: '1' }, 100_000_000_000_000n, 0n]);
        const sent = signAndSendTransaction.mock.calls[0]![0];
        expect(sent.receiverId).toBe('agora-market.agora-testnet.testnet');
        expect(sent.throwOnFailure).toBe(false);
        expect(recordRealCall.mock.calls[0]![0]).toMatchObject({ txHash: 'HASH1', signer: 'agents.lumen.testnet', method: 'post_job', ok: true, error: null, jobKey: null });
    });

    it('sends ft_transfer_call to the USDC contract with 1 yocto and 300 Tgas', async () => {
        const { service } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockResolvedValue(ok('0'));
        await service.callAs('owner', 'patchsmith.testnet', 'ft_transfer_call', { receiver_id: 'agora-market.agora-testnet.testnet', amount: '10000000', msg: 'starter_stake' }, '1');
        expect(signAndSendTransaction.mock.calls[0]![0].receiverId).toBe('usdc.fakes.testnet');
        expect(functionCall.mock.calls[0]![2]).toBe(300_000_000_000_000n);
        expect(functionCall.mock.calls[0]![3]).toBe(1n);
    });

    it('uses the platform key from the environment and 300 Tgas for withdraw', async () => {
        process.env['AGORA_PLATFORM_PRIVATE_KEY'] = KEY;
        process.env['NEAR_RPC_URL'] = 'https://rpc.example.test';
        const { service, getVaultSecret } = await build();
        signAndSendTransaction.mockResolvedValue(ok(null));
        await service.callAs('platform', 'agora-testnet.testnet', 'register_seller', { account_id: 'x.testnet' }, '1');
        expect(getVaultSecret.mock.calls).toHaveLength(0);
        expect(providerCtor.mock.calls[0]).toEqual([{ url: 'https://rpc.example.test' }]);
        expect(functionCall.mock.calls[0]![3]).toBe(1n);
        const { service: owner } = await build(jest.fn().mockResolvedValue(KEY));
        await owner.callAs('owner', 'lumen.testnet', 'withdraw', { amount: '1' }, '1');
        expect(functionCall.mock.calls[1]![2]).toBe(300_000_000_000_000n);
    });

    it('refuses with a clear 400 when there is no signing key', async () => {
        const { service } = await build();
        await expect(service.callAs('owner', 'lumen.testnet', 'withdraw', { amount: '1' }, '1')).rejects.toThrow('No signing key for lumen.testnet');
        expect(signAndSendTransaction.mock.calls).toHaveLength(0);
    });

    it('refuses a Vault secret that is not a NEAR key', async () => {
        const { service } = await build(jest.fn().mockResolvedValue('not-a-key'));
        await expect(service.callAs('owner', 'lumen.testnet', 'pause', {})).rejects.toThrow('is not a NEAR key');
    });

    it('turns a contract panic into Contract refused and records it as rejected', async () => {
        const { service, recordRealCall } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockResolvedValue({
            status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: Job is not accepted' } } } } },
            transaction: { hash: 'HASH2' }, transaction_outcome: { id: 'HASH2' }, receipts_outcome: [],
        });
        await expect(service.callAs('transaction_agent', 'agents.lumen.testnet', 'fund_job', { job_id: '17' })).rejects.toThrow('Contract refused fund_job: Job is not accepted');
        expect(recordRealCall.mock.calls[0]![0]).toMatchObject({ txHash: 'HASH2', ok: false, error: 'Job is not accepted', jobKey: { onchainId: 17n } });
    });

    it('reports a failed receipt inside a cross-contract call', async () => {
        const { service } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockResolvedValue({
            status: { SuccessValue: b64('0') }, transaction: { hash: 'HASH3' }, transaction_outcome: { id: 'HASH3' },
            receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }, { outcome: { status: { Failure: { error_message: 'Smart contract panicked: The re-check already agrees with you', error_type: 'ActionError' } } } }],
        });
        await expect(service.callAs('owner', 'lumen.testnet', 'ft_transfer_call', { msg: 'dispute_bond:17', amount: '1' }, '1')).rejects.toThrow('Contract refused ft_transfer_call: The re-check already agrees with you');
    });

    it('wraps a transport error', async () => {
        const { service } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockRejectedValue(new Error('Access key not found'));
        await expect(service.callAs('owner', 'lumen.testnet', 'pause', {})).rejects.toThrow('Could not send pause: Access key not found');
    });

    it('applies a confirmed call to the database and syncs every party balance from the chain', async () => {
        const { service, applyCall, syncBalance } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockResolvedValue(ok(null, 'FUND1'));
        callFunction.mockResolvedValue({ free: '88000000', escrowed: '32000000' });
        await service.callAs('transaction_agent', 'agents.lumen.testnet', 'fund_job', { job_id: '17' });
        expect(applyCall.mock.calls[0]).toEqual([{ signer: 'agents.lumen.testnet', method: 'fund_job', args: { job_id: '17' }, txHash: 'FUND1' }]);
        expect(syncBalance.mock.calls).toEqual([['lumen.testnet', 88, 32], ['patchsmith.testnet', 88, 32]]);
    });

    it('does not apply a refused call', async () => {
        const { service, applyCall } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockResolvedValue({ status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: Paused' } } } } }, transaction: { hash: 'BAD1' } });
        await expect(service.callAs('transaction_agent', 'agents.lumen.testnet', 'fund_job', { job_id: '17' })).rejects.toThrow('Contract refused fund_job: Paused');
        expect(applyCall.mock.calls).toHaveLength(0);
    });

    it('keeps the tx when indexing fails, so the chain result is never lost', async () => {
        const { service, applyCall } = await build(jest.fn().mockResolvedValue(KEY));
        signAndSendTransaction.mockResolvedValue(ok(null, 'FUND2'));
        applyCall.mockRejectedValue(new Error('db down'));
        callFunction.mockResolvedValue({ free: '0', escrowed: '0' });
        await expect(service.callAs('transaction_agent', 'agents.lumen.testnet', 'fund_job', { job_id: '17' })).resolves.toMatchObject({ tx_hash: 'FUND2' });
    });

    it('indexes a transaction signed elsewhere by its hash', async () => {
        const { service, applyCall, recordRealCall } = await build();
        viewTransactionStatus.mockResolvedValue({
            ...ok(null, 'TIMER1'),
            transaction: { hash: 'TIMER1', signer_id: 'agora-testnet.testnet', receiver_id: 'agora-market.agora-testnet.testnet', actions: [{ FunctionCall: { method_name: 'refund_expired', args: b64({ job_id: '17' }) } }] },
        });
        callFunction.mockResolvedValue({ free: '32000000', escrowed: '0' });
        await expect(service.indexTx('TIMER1', 'agora-testnet.testnet')).resolves.toEqual({ indexed: true, ok: true, method: 'refund_expired', reason: null });
        expect(viewTransactionStatus.mock.calls[0]).toEqual([{ txHash: 'TIMER1', accountId: 'agora-testnet.testnet', waitUntil: 'FINAL' }]);
        expect(recordRealCall.mock.calls[0]![0]).toMatchObject({ txHash: 'TIMER1', method: 'refund_expired', ok: true, jobKey: { onchainId: 17n } });
        expect(applyCall.mock.calls[0]).toEqual([{ signer: 'agora-testnet.testnet', method: 'refund_expired', args: { job_id: '17' }, txHash: 'TIMER1' }]);
    });

    it('skips a hash it already indexed and calls to other contracts', async () => {
        const { service, hasTx, applyCall } = await build();
        hasTx.mockResolvedValueOnce(true);
        await expect(service.indexTx('DONE1', 'x.testnet')).resolves.toMatchObject({ indexed: false, reason: 'Already indexed' });
        viewTransactionStatus.mockResolvedValue({ ...ok(null, 'OTHER1'), transaction: { hash: 'OTHER1', signer_id: 'x.testnet', receiver_id: 'other.testnet', actions: [{ FunctionCall: { method_name: 'fund_job', args: b64({}) } }] } });
        await expect(service.indexTx('OTHER1', 'x.testnet')).resolves.toMatchObject({ indexed: false, reason: 'Not a call to the AGORA contract' });
        expect(applyCall.mock.calls).toHaveLength(0);
    });

    it('calls the contract view through the RPC provider', async () => {
        const { service } = await build();
        callFunction.mockResolvedValue({ free: '5', escrowed: '0' });
        await expect(service.view('get_balance', { account_id: 'lumen.testnet' })).resolves.toEqual({ free: '5', escrowed: '0' });
        expect(callFunction.mock.calls[0]).toEqual([{ contractId: 'agora-market.agora-testnet.testnet', method: 'get_balance', args: { account_id: 'lumen.testnet' } }]);
    });

    it('refreshes one balance from the contract', async () => {
        const { service, syncBalance } = await build();
        callFunction.mockResolvedValue({ free: '7500000', escrowed: '2000000' });
        await expect(service.refreshBalance('lumen.testnet')).resolves.toBe(true);
        expect(syncBalance.mock.calls[0]).toEqual(['lumen.testnet', 7.5, 2]);
        callFunction.mockRejectedValue(new Error('rpc down'));
        await expect(service.refreshBalance('lumen.testnet')).resolves.toBe(false);
    });

    it('reads the live balance and saves it without waiting', async () => {
        const { service, syncBalance } = await build();
        callFunction.mockResolvedValue({ free: '15000000', escrowed: '0' });
        await expect(service.liveBalance('lumen.testnet')).resolves.toEqual({ available: 15, escrowed: 0 });
        expect(syncBalance.mock.calls[0]).toEqual(['lumen.testnet', 15, 0]);
        callFunction.mockRejectedValue(new Error('rpc down'));
        await expect(service.liveBalance('lumen.testnet')).resolves.toBeNull();
    });

    it('needs a platform account to create accounts', async () => {
        delete process.env['AGORA_PLATFORM_ACCOUNT'];
        const { service } = await build();
        await expect(service.createAccount('abc')).rejects.toThrow('Set AGORA_PLATFORM_ACCOUNT');
    });

    it('recognises the agora-xxxxxxxx names it hands out, with or without agents.', async () => {
        const { service } = await build();
        expect(service.isPlatformAccount('agora-0f9b6c1e.testnet')).toBe(true);
        expect(service.isPlatformAccount('agents.agora-0f9b6c1e.testnet')).toBe(true);
        expect(service.isPlatformAccount('slowant9971.testnet')).toBe(false);
        expect(service.isPlatformAccount('itsuki.agents.agora-0f9b6c1e.testnet')).toBe(false);
    });

    it('explains how to enable agents when a wallet user has no agents key', async () => {
        const { service } = await build();
        await expect(service.signingKey('transaction_agent', 'agents.slowant9971.testnet')).rejects.toThrow('Enable agents');
    });

    it('needs the contract id', async () => {
        delete process.env['AGORA_CONTRACT_ID'];
        const { service } = await build(jest.fn().mockResolvedValue(KEY));
        await expect(service.callAs('owner', 'lumen.testnet', 'pause', {})).rejects.toThrow('Set AGORA_CONTRACT_ID');
    });
});

describe('outcome helpers', () => {
    it('reads the single function call of a transaction', () => {
        const tx = (actions: unknown[]) => ({ transaction: { signer_id: 's.testnet', receiver_id: 'c.testnet', actions } });
        expect(functionCallOf(tx([{ FunctionCall: { method_name: 'fund_job', args: b64({ job_id: '1' }) } }]))).toEqual({ signer: 's.testnet', receiverId: 'c.testnet', method: 'fund_job', args: { job_id: '1' } });
        expect(functionCallOf(tx([{ FunctionCall: { method_name: 'x', args: 'not-json' } }]))?.args).toEqual({});
        expect(functionCallOf(tx([{ Transfer: {} }]))).toBeNull();
        expect(functionCallOf(tx([]))).toBeNull();
        expect(functionCallOf(null)).toBeNull();
    });


    it('decodes success values', () => {
        expect(decodeSuccessValue(b64('17'))).toBe('17');
        expect(decodeSuccessValue(Buffer.from('plain').toString('base64'))).toBe('plain');
        expect(decodeSuccessValue('')).toBeNull();
    });

    it('finds the panic message in any failure shape', () => {
        expect(panicMessage({ ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: Paused' } } } })).toBe('Paused');
        expect(panicMessage({ error_message: 'Over daily cap', error_type: 'x' })).toBe('Over daily cap');
        expect(panicMessage({ InvalidTxError: 'NotEnoughBalance' })).toContain('NotEnoughBalance');
    });

    it('parses a successful outcome', () => {
        expect(parseOutcome({ status: { SuccessValue: b64('9') }, transaction_outcome: { id: 'H' } })).toEqual({ txHash: 'H', ok: true, result: '9', error: null });
    });

    it('builds deadlines in nanoseconds', () => {
        expect(deadlineIn(1, 1_000)).toBe(String(1_000n * 1_000_000n + 86_400_000_000_000n));
    });
});
