import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { SupabaseAdminService } from '../auth/supabase-admin.service.js';
import { ChainService } from '../chain/chain.service.js';
import { CreateDeposit } from './dto/CreateDeposit.dto.js';
import { CreateWithdrawal } from './dto/CreateWithdrawal.dto.js';
import { LinkWallet } from './dto/LinkWallet.dto.js';
import { SignInWallet } from './dto/SignInWallet.dto.js';
import { SyncWalletTx } from './dto/SyncWalletTx.dto.js';
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
    open_dispute: 'Dispute opened, free re-check started',
    ft_transfer_call: 'Dispute bond paid to ask the DAO',
    resolve_dispute: 'Dispute decided by the DAO',
    finalize_default: 'Dispute closed after 72 hours',
    return_stake: 'Starter stake returned',
    starter_stake: 'Starter stake added',
};

export const labelOf = (method: string, args: Record<string, unknown>): string =>
    method === 'ft_transfer_call' && args['msg'] === 'starter_stake' ? LABELS['starter_stake']! : LABELS[method] ?? method;

const units = (amount: number): string => String(Math.round(amount * 1_000_000));
const usdc = (value: unknown): number | null => {
    const n = Number(value);
    return typeof value === 'string' && Number.isFinite(n) ? n / 1_000_000 : null;
};
export const LINK_RECIPIENT = 'agora';
const LINK_MAX_AGE_MS = 10 * 60 * 1000;

export const signInMessage = (accountId: string, issuedAt: string): string =>
    `Sign in to AGORA as ${accountId}. Issued at ${issuedAt}`;
const SIGN_IN_MAX_AGE_MS = 5 * 60 * 1000;

export const linkMessage = (accountId: string, userId: string, issuedAt: string): string =>
    `Link NEAR account ${accountId} to AGORA user ${userId}. Issued at ${issuedAt}`;

const sameDay = (a: Date | null): boolean => a !== null && a.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

@Injectable()
export class WalletService {
    constructor(
        private readonly walletRepository: WalletRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
        private readonly supabaseAdmin: SupabaseAdminService,
    ) {}

    async getWallet(token: string) {
        const authId = await this.authId(token);
        const account = await this.walletRepository.getAccount(authId);
        const acct = account?.nearAccountId ?? '';
        const agents = account?.agentsAccountId ?? '';
        if (acct) await this.chainService.refreshBalance(acct);
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
            chain: this.chainService.walletChainInfo(),
            items: activity.map((t) => {
                const args = (t.args ?? {}) as Record<string, unknown>;
                const amount = usdc(args['amount']) ?? (t.job?.agreedPrice !== null && t.job?.agreedPrice !== undefined && ['fund_job', 'vote', 'refund_milestone', 'refund_expired'].includes(t.method) ? Number(t.job.agreedPrice) : null);
                return {
                    id: t.id,
                    method: t.method,
                    label: labelOf(t.method, args),
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

    async signInWithWallet(body: SignInWallet) {
        this.checkNetwork(body.account_id);
        const issuedAt = /Issued at (\S+)$/.exec(body.message)?.[1] ?? '';
        const age = Date.now() - Date.parse(issuedAt);
        if (body.message !== signInMessage(body.account_id, issuedAt) || !(age >= -60_000 && age <= SIGN_IN_MAX_AGE_MS)) {
            throw new BadRequestException('The signed message is not a sign-in for this account or has expired. Try again');
        }
        const nonce = Buffer.from(body.nonce, 'base64');
        if (nonce.length !== 32) throw new BadRequestException('Nonce must be 32 bytes');
        await this.chainService.verifyWalletSignature({
            accountId: body.account_id,
            publicKey: body.public_key,
            signature: Buffer.from(body.signature, 'base64'),
            message: body.message,
            nonce,
            recipient: LINK_RECIPIENT,
            callbackUrl: body.callback_url,
        });

        const profile = await this.walletRepository.findProfileByAccount(body.account_id);
        let email: string | null;
        let created = false;
        if (profile) {
            email = await this.supabaseAdmin.getUserEmail(profile.id);
            if (!email) throw new BadRequestException(`${body.account_id} belongs to a profile that cannot sign in. Sign in with Google and link the wallet instead`);
        } else {
            const user = await this.supabaseAdmin.createWalletUser(body.account_id);
            const implicit = /^[0-9a-f]{64}$/.test(body.account_id);
            const agents = implicit ? null : `agents.${body.account_id}`;
            const agentsTaken = agents ? await this.walletRepository.findAccountOwner(agents, user.id) : null;
            await this.walletRepository.createWalletProfile(user.id, body.account_id, agentsTaken ? null : agents);
            email = user.email;
            created = true;
        }
        const tokenHash = await this.supabaseAdmin.signInTokenFor(email);
        return { message: 'Wallet Sign In Successfully Started', acct: body.account_id, created, token_hash: tokenHash };
    }

    async linkWallet(token: string, body: LinkWallet) {
        const authId = await this.authId(token);
        this.checkNetwork(body.account_id);
        const implicit = /^[0-9a-f]{64}$/.test(body.account_id);
        const issuedAt = /Issued at (\S+)$/.exec(body.message)?.[1] ?? '';
        const age = Date.now() - Date.parse(issuedAt);
        if (body.message !== linkMessage(body.account_id, authId, issuedAt) || !(age >= -60_000 && age <= LINK_MAX_AGE_MS)) {
            throw new BadRequestException('The signed message is not for this account or has expired. Try linking again');
        }
        const nonce = Buffer.from(body.nonce, 'base64');
        if (nonce.length !== 32) throw new BadRequestException('Nonce must be 32 bytes');

        await this.chainService.verifyWalletSignature({
            accountId: body.account_id,
            publicKey: body.public_key,
            signature: Buffer.from(body.signature, 'base64'),
            message: body.message,
            nonce,
            recipient: LINK_RECIPIENT,
            callbackUrl: body.callback_url,
        });

        const account = await this.walletRepository.getAccount(authId);
        if (!account) throw new BadRequestException('Open your account first');
        if (await this.walletRepository.findAccountOwner(body.account_id, authId)) {
            throw new ConflictException(`${body.account_id} is already linked to another AGORA account`);
        }
        const agents = implicit ? (account.agentsAccountId ?? '') : `agents.${body.account_id}`;
        if (agents && (await this.walletRepository.findAccountOwner(agents, authId))) {
            throw new ConflictException(`${agents} is already used by another AGORA account`);
        }
        await this.walletRepository.setAccountIds(authId, body.account_id, agents);
        return { message: 'Wallet Successfully Linked', acct: body.account_id, agents, previous: account.nearAccountId ?? null };
    }

    async syncWalletTx(token: string, body: SyncWalletTx) {
        const authId = await this.authId(token);
        const account = await this.walletRepository.getAccount(authId);
        if (!account?.nearAccountId) throw new BadRequestException('Link your NEAR wallet first');
        if (this.chainService.isMock()) {
            throw new BadRequestException('The marketplace runs on mock money right now, so wallet transactions are not counted in your AGORA balance');
        }
        const result = await this.chainService.indexTx(body.tx_hash, account.nearAccountId);
        return { message: 'Wallet Transaction Successfully Recorded', txHash: body.tx_hash, explorer: this.chainService.explorerTxUrl(body.tx_hash), ...result };
    }

    private checkNetwork(accountId: string): void {
        const network = this.chainService.networkId();
        if (!/^[0-9a-f]{64}$/.test(accountId) && !accountId.endsWith(`.${network}`)) {
            throw new BadRequestException(`Connect a ${network} account (it ends in .${network})`);
        }
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }
}
