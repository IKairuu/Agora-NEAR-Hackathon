import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { ChainService } from '../chain/chain.service.js';
import { CreateDeposit } from './dto/CreateDeposit.dto.js';
import { CreateWithdrawal } from './dto/CreateWithdrawal.dto.js';
import { WalletRepository } from './wallet.repository.js';

const LABELS: Record<string, string> = {
    deposit: 'Deposit',
    withdraw: 'Withdrawal',
    fund_job: 'Moved to Protected payment',
    vote: 'Released after 2 of 3 approvals',
    refund_milestone: 'Refunded',
    refund_expired: 'Refunded after the deadline',
    set_mandate: 'Limits saved',
    pause: 'Agents paused',
    unpause: 'Agents unpaused',
    post_job: 'Job posted',
    place_bid: 'Offer placed',
    accept_offer: 'Offer accepted',
    submit_delivery: 'Delivery submitted',
    register_seller: 'Seller registered',
    rerun_review: 'Review rerun',
    rate: 'Rating saved',
};

const units = (amount: number): string => String(Math.round(amount * 1_000_000));
const usdc = (value: unknown): number | null => {
    const n = Number(value);
    return typeof value === 'string' && Number.isFinite(n) ? n / 1_000_000 : null;
};
const sameDay = (a: Date | null): boolean => a !== null && a.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

@Injectable()
export class WalletService {
    constructor(
        private readonly walletRepository: WalletRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
    ) {}

    async getWallet(token: string) {
        const authId = await this.authId(token);
        const account = await this.walletRepository.getAccount(authId);
        const acct = account?.nearAccountId ?? '';
        const agents = account?.agentsAccountId ?? '';
        const [balance, activity] = await Promise.all([
            acct ? this.walletRepository.getBalance(acct) : Promise.resolve(null),
            this.walletRepository.getActivity(authId, [acct, agents].filter(Boolean)),
        ]);
        const available = balance ? Number(balance.available) : 0;
        const escrowed = balance ? Number(balance.escrowed) : 0;
        return {
            acct,
            agents,
            available,
            escrowed,
            total: available + escrowed,
            usedToday: balance && sameDay(balance.dayStarted) ? Number(balance.spentToday) : 0,
            items: activity.map((t) => {
                const args = (t.args ?? {}) as Record<string, unknown>;
                const amount = usdc(args['amount']) ?? (t.job?.agreedPrice !== null && t.job?.agreedPrice !== undefined && ['fund_job', 'vote', 'refund_milestone', 'refund_expired'].includes(t.method) ? Number(t.job.agreedPrice) : null);
                return {
                    id: t.id,
                    method: t.method,
                    label: LABELS[t.method] ?? t.method,
                    job: t.job?.ref ?? null,
                    amount,
                    status: t.status,
                    error: t.error,
                    txHash: t.txHash,
                    explorer: t.txHash ? this.chainService.explorerTxUrl(t.txHash) : null,
                    at: t.createdAt,
                };
            }),
        };
    }

    async createWithdrawal(token: string, body: CreateWithdrawal) {
        const authId = await this.authId(token);
        const account = await this.walletRepository.getAccount(authId);
        if (!account?.nearAccountId) throw new BadRequestException('You have no NEAR account yet, so there is nothing to withdraw');
        const tx = await this.chainService.callAs('owner', account.nearAccountId, 'withdraw', { amount: units(body.amount) }, '1');
        return { message: 'Withdrawal Successfully Sent', amount: body.amount, txHash: tx.tx_hash, explorer: tx.explorer_url };
    }

    async createDeposit(token: string, body: CreateDeposit) {
        const authId = await this.authId(token);
        if ((process.env['AGORA_CHAIN_MODE'] ?? 'mock') !== 'mock') {
            throw new BadRequestException('Add funds from your NEAR wallet with ft_transfer_call to the marketplace contract');
        }
        const account = await this.walletRepository.getAccount(authId);
        if (!account) throw new BadRequestException('Open your account first');
        let acct = account.nearAccountId;
        if (!acct || !account.agentsAccountId) {
            const created = await this.chainService.createAccount(authId);
            acct = acct ?? created.account_id;
            await this.walletRepository.setAccountIds(authId, acct, account.agentsAccountId ?? created.agents_account_id);
        }
        const tx = await this.chainService.callAs('owner', acct, 'deposit', { amount: units(body.amount) });
        return { message: 'Test Deposit Successfully Added', amount: body.amount, txHash: tx.tx_hash, explorer: tx.explorer_url };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }
}
