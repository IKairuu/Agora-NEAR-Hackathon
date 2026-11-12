jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { SupabaseAdminService } from '../auth/supabase-admin.service';
import { ChainService } from '../chain/chain.service';
import { Prisma } from '../generated/prisma/client';
import { WalletRepository } from './wallet.repository';
import { labelOf, linkMessage, signInMessage, WalletService } from './wallet.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const D = (n: number) => new Prisma.Decimal(n);

describe('WalletService', () => {
    let repo: jest.Mocked<WalletRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: WalletService;
    let admin: jest.Mocked<SupabaseAdminService>;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            getAccount: jest.fn().mockResolvedValue({ id: USER, nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet' }),
            setAccountIds: jest.fn(), findAccountOwner: jest.fn().mockResolvedValue(null), findProfileByAccount: jest.fn().mockResolvedValue(null), createWalletProfile: jest.fn(), getBalance: jest.fn(), getActivity: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<WalletRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-x-1', explorer_url: 'https://testnet.nearblocks.io/txns/mock-x-1', result: null }),
            createAccount: jest.fn().mockResolvedValue({ account_id: 'agora-new.testnet', agents_account_id: 'agents.agora-new.testnet' }),
            explorerTxUrl: jest.fn((tx: string) => `https://testnet.nearblocks.io/txns/${tx}`),
            networkId: jest.fn().mockReturnValue('testnet'),
            walletChainInfo: jest.fn().mockReturnValue({ mode: 'mock', network: 'testnet', contract: 'agora-market-kyle.testnet', usdc: null }),
            isMock: jest.fn().mockReturnValue(true),
            indexTx: jest.fn().mockResolvedValue({ indexed: true, ok: true, method: 'ft_transfer_call', reason: null }),
            verifyWalletSignature: jest.fn().mockResolvedValue(undefined),
            refreshBalance: jest.fn().mockResolvedValue(false),
        } as unknown as jest.Mocked<ChainService>;
        admin = {
            getUserEmail: jest.fn().mockResolvedValue('kai@example.com'),
            createWalletUser: jest.fn().mockResolvedValue({ id: 'new-user', email: 'kairu.testnet@wallet.agora.invalid' }),
            signInTokenFor: jest.fn().mockResolvedValue('hashed-token'),
        } as unknown as jest.Mocked<SupabaseAdminService>;
        service = new WalletService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService, chain, admin);
    });

    afterEach(() => { process.env = { ...env }; });

    it('shows the balance, today and labelled activity', async () => {
        repo.getBalance.mockResolvedValue({ available: D(88), escrowed: D(32), spentToday: D(32), dayStarted: new Date() });
        repo.getActivity.mockResolvedValue([
            { id: 't1', method: 'fund_job', args: { job_id: 'J-1042' }, txHash: 'mock-fund_job-1', status: 'success', error: null, createdAt: new Date(), job: { ref: 'J-1042', agreedPrice: D(32) } },
            { id: 't2', method: 'deposit', args: { amount: '10000000' }, txHash: 'mock-deposit-1', status: 'success', error: null, createdAt: new Date(), job: null },
        ] as never);
        const w = await service.getWallet('Bearer t');
        expect(w).toMatchObject({ acct: 'lumen.testnet', available: 88, escrowed: 32, total: 120, usedToday: 32, chain: { mode: 'mock', contract: 'agora-market-kyle.testnet' } });
        expect(w.items[0]).toMatchObject({ label: 'Moved to Protected payment', job: 'J-1042', amount: 32 });
        expect(w.items[1]).toMatchObject({ label: 'Deposit', amount: 10 });
        expect(repo.getActivity.mock.calls[0]).toEqual([USER, ['lumen.testnet', 'agents.lumen.testnet']]);
        expect(chain.refreshBalance.mock.calls[0]).toEqual(['lumen.testnet']);
    });

    it('withdraws with the full-access key and one yocto', async () => {
        await expect(service.createWithdrawal('Bearer t', { amount: 12.5 })).resolves.toMatchObject({ message: 'Withdrawal Successfully Sent', amount: 12.5 });
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'lumen.testnet', 'withdraw', { amount: '12500000' }, '1']);
    });

    it('refuses to withdraw without an account', async () => {
        repo.getAccount.mockResolvedValue({ id: USER, nearAccountId: null, agentsAccountId: null });
        await expect(service.createWithdrawal('Bearer t', { amount: 1 })).rejects.toThrow('no NEAR account');
    });

    it('adds test funds only in mock mode, creating the account first', async () => {
        repo.getAccount.mockResolvedValue({ id: USER, nearAccountId: null, agentsAccountId: null });
        await service.createDeposit('Bearer t', { amount: 50 });
        expect(repo.setAccountIds.mock.calls[0]).toEqual([USER, 'agora-new.testnet', 'agents.agora-new.testnet']);
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'agora-new.testnet', 'deposit', { amount: '50000000' }]);
        process.env['AGORA_CHAIN_MODE'] = 'testnet';
        await expect(service.createDeposit('Bearer t', { amount: 50 })).rejects.toThrow('ft_transfer_call');
    });

    describe('recording a transaction signed in the wallet', () => {
        const TX = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

        it('indexes it for the linked account in real chain mode', async () => {
            chain.isMock.mockReturnValue(false);
            await expect(service.syncWalletTx('Bearer t', { tx_hash: TX })).resolves.toMatchObject({ message: 'Wallet Transaction Successfully Recorded', indexed: true, method: 'ft_transfer_call' });
            expect(chain.indexTx).toHaveBeenCalledWith(TX, 'lumen.testnet');
        });

        it('refuses in mock mode and without a linked account', async () => {
            await expect(service.syncWalletTx('Bearer t', { tx_hash: TX })).rejects.toThrow('mock money');
            repo.getAccount.mockResolvedValue({ id: USER, nearAccountId: null, agentsAccountId: null });
            await expect(service.syncWalletTx('Bearer t', { tx_hash: TX })).rejects.toThrow('Link your NEAR wallet first');
            expect(chain.indexTx).not.toHaveBeenCalled();
        });
    });

    describe('signing in with a NEAR wallet', () => {
        const now = new Date().toISOString();
        const body = (over: Record<string, string> = {}) => ({
            account_id: 'kairu.testnet', public_key: 'ed25519:7dpsGrbtg5Lc4G1SVGpxxQWgKBVp4S2jF3ksErpUWr4r',
            signature: Buffer.alloc(64, 1).toString('base64'), nonce: Buffer.alloc(32, 2).toString('base64'),
            message: signInMessage('kairu.testnet', now), ...over,
        });

        it('creates an account for a new wallet and returns a one-time sign-in token', async () => {
            await expect(service.signInWithWallet(body())).resolves.toMatchObject({ acct: 'kairu.testnet', created: true, token_hash: 'hashed-token' });
            expect(chain.verifyWalletSignature).toHaveBeenCalled();
            expect(admin.createWalletUser).toHaveBeenCalledWith('kairu.testnet');
            expect(repo.createWalletProfile).toHaveBeenCalledWith('new-user', 'kairu.testnet', 'agents.kairu.testnet');
            expect(admin.signInTokenFor).toHaveBeenCalledWith('kairu.testnet@wallet.agora.invalid');
        });

        it('signs in to the account the wallet is already linked to', async () => {
            repo.findProfileByAccount.mockResolvedValue({ id: USER } as never);
            await expect(service.signInWithWallet(body())).resolves.toMatchObject({ created: false, token_hash: 'hashed-token' });
            expect(admin.createWalletUser).not.toHaveBeenCalled();
            expect(admin.signInTokenFor).toHaveBeenCalledWith('kai@example.com');
        });

        it('refuses an old or reused message before checking anything else', async () => {
            await expect(service.signInWithWallet(body({ message: signInMessage('kairu.testnet', '2026-01-01T00:00:00.000Z') }))).rejects.toThrow('expired');
            await expect(service.signInWithWallet(body({ message: linkMessage('kairu.testnet', USER, now) }))).rejects.toThrow('not a sign-in');
            expect(chain.verifyWalletSignature).not.toHaveBeenCalled();
            expect(admin.signInTokenFor).not.toHaveBeenCalled();
        });

        it('gives no token when the signature check fails', async () => {
            chain.verifyWalletSignature.mockRejectedValueOnce(new Error('The wallet signature does not match'));
            await expect(service.signInWithWallet(body())).rejects.toThrow('does not match');
            expect(admin.signInTokenFor).not.toHaveBeenCalled();
        });
    });

    describe('linking a NEAR wallet', () => {
        const now = new Date().toISOString();
        const body = (over: Record<string, string> = {}) => ({
            account_id: 'kairu.testnet', public_key: 'ed25519:7dpsGrbtg5Lc4G1SVGpxxQWgKBVp4S2jF3ksErpUWr4r',
            signature: Buffer.alloc(64, 1).toString('base64'), nonce: Buffer.alloc(32, 2).toString('base64'),
            message: linkMessage('kairu.testnet', USER, now), callback_url: 'https://agora.example/wallet', ...over,
        });

        it('checks the signature, then saves the account and its agents sub-account', async () => {
            await expect(service.linkWallet('Bearer t', body())).resolves.toMatchObject({ acct: 'kairu.testnet', agents: 'agents.kairu.testnet', previous: 'lumen.testnet' });
            expect(chain.verifyWalletSignature.mock.calls[0]![0]).toMatchObject({ accountId: 'kairu.testnet', recipient: 'agora', message: linkMessage('kairu.testnet', USER, now), callbackUrl: 'https://agora.example/wallet' });
            expect(repo.setAccountIds.mock.calls[0]).toEqual([USER, 'kairu.testnet', 'agents.kairu.testnet']);
        });

        it('refuses a message signed for another user or long ago', async () => {
            await expect(service.linkWallet('Bearer t', body({ message: linkMessage('kairu.testnet', 'someone-else', now) }))).rejects.toThrow('not for this account');
            await expect(service.linkWallet('Bearer t', body({ message: linkMessage('kairu.testnet', USER, '2026-01-01T00:00:00.000Z') }))).rejects.toThrow('expired');
            expect(chain.verifyWalletSignature).not.toHaveBeenCalled();
        });

        it('refuses a mainnet account on testnet', async () => {
            await expect(service.linkWallet('Bearer t', body({ account_id: 'kairu.near', message: linkMessage('kairu.near', USER, now) }))).rejects.toThrow('testnet account');
        });

        it('refuses an account another user already linked', async () => {
            repo.findAccountOwner.mockResolvedValueOnce({ id: 'other' } as never);
            await expect(service.linkWallet('Bearer t', body())).rejects.toThrow('already linked');
            expect(repo.setAccountIds).not.toHaveBeenCalled();
        });

        it('keeps the agents account for an implicit account, which cannot have sub-accounts', async () => {
            const hex = 'a'.repeat(64);
            await service.linkWallet('Bearer t', body({ account_id: hex, message: linkMessage(hex, USER, now) }));
            expect(repo.setAccountIds.mock.calls[0]).toEqual([USER, hex, 'agents.lumen.testnet']);
        });

        it('does not save anything when the signature check fails', async () => {
            chain.verifyWalletSignature.mockRejectedValueOnce(new Error('The wallet signature does not match'));
            await expect(service.linkWallet('Bearer t', body())).rejects.toThrow('does not match');
            expect(repo.setAccountIds).not.toHaveBeenCalled();
        });
    });
});

describe('wallet labels', () => {
    it('tells a starter stake apart from a dispute bond', () => {
        expect(labelOf('ft_transfer_call', { msg: 'starter_stake' })).toBe('Starter stake added');
        expect(labelOf('ft_transfer_call', { msg: 'dispute_bond:7' })).toBe('Dispute bond paid to ask the DAO');
        expect(labelOf('return_stake', {})).toBe('Starter stake returned');
        expect(labelOf('unknown_method', {})).toBe('unknown_method');
    });
});
