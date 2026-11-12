jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { Prisma } from '../generated/prisma/client';
import { WalletRepository } from './wallet.repository';
import { labelOf, linkMessage, WalletService } from './wallet.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const D = (n: number) => new Prisma.Decimal(n);

describe('WalletService', () => {
    let repo: jest.Mocked<WalletRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: WalletService;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            getAccount: jest.fn().mockResolvedValue({ id: USER, nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet' }),
            setAccountIds: jest.fn(), findAccountOwner: jest.fn().mockResolvedValue(null), getBalance: jest.fn(), getActivity: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<WalletRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-x-1', explorer_url: 'https://testnet.nearblocks.io/txns/mock-x-1', result: null }),
            createAccount: jest.fn().mockResolvedValue({ account_id: 'agora-new.testnet', agents_account_id: 'agents.agora-new.testnet' }),
            explorerTxUrl: jest.fn((tx: string) => `https://testnet.nearblocks.io/txns/${tx}`),
            networkId: jest.fn().mockReturnValue('testnet'),
            verifyWalletSignature: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<ChainService>;
        service = new WalletService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService, chain);
    });

    afterEach(() => { process.env = { ...env }; });

    it('shows the balance, today and labelled activity', async () => {
        repo.getBalance.mockResolvedValue({ available: D(88), escrowed: D(32), spentToday: D(32), dayStarted: new Date() });
        repo.getActivity.mockResolvedValue([
            { id: 't1', method: 'fund_job', args: { job_id: 'J-1042' }, txHash: 'mock-fund_job-1', status: 'success', error: null, createdAt: new Date(), job: { ref: 'J-1042', agreedPrice: D(32) } },
            { id: 't2', method: 'deposit', args: { amount: '10000000' }, txHash: 'mock-deposit-1', status: 'success', error: null, createdAt: new Date(), job: null },
        ] as never);
        const w = await service.getWallet('Bearer t');
        expect(w).toMatchObject({ acct: 'lumen.testnet', available: 88, escrowed: 32, total: 120, usedToday: 32 });
        expect(w.items[0]).toMatchObject({ label: 'Moved to Protected payment', job: 'J-1042', amount: 32 });
        expect(w.items[1]).toMatchObject({ label: 'Deposit', amount: 10 });
        expect(repo.getActivity.mock.calls[0]).toEqual([USER, ['lumen.testnet', 'agents.lumen.testnet']]);
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
