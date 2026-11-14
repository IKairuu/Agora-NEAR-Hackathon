import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { ChainService } from '../chain/chain.service.js';
import { MANDATE_DEFAULTS } from '../indexer/indexer.repository.js';
import { EditMandate } from './dto/EditMandate.dto.js';
import { MandatesRepository } from './mandates.repository.js';

type MandateRow = NonNullable<NonNullable<Awaited<ReturnType<MandatesRepository['getMandate']>>>['mandate']>;

interface ChainMandate { per_job_cap: string; daily_cap: string; new_seller_cap: string; review_timeout_hours: number; categories: string[]; strict: boolean; paused: boolean }

const units = (amount: number): string => String(Math.round(amount * 1_000_000));
const sameDay = (a: Date | null): boolean => a !== null && a.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

export const currentLimits = (m: MandateRow | null) => ({
    perJobCap: m ? Number(m.perJobCap) : MANDATE_DEFAULTS.perJobCap,
    dailyCap: m ? Number(m.dailyCap) : MANDATE_DEFAULTS.dailyCap,
    newSellerCap: m ? Number(m.newSellerCap) : MANDATE_DEFAULTS.newSellerCap,
    reviewWindowHours: m?.reviewWindowHours ?? MANDATE_DEFAULTS.reviewWindowHours,
    categories: m?.allowedCategories ?? MANDATE_DEFAULTS.allowedCategories,
    strict: m?.strictSellers ?? MANDATE_DEFAULTS.strictSellers,
});

@Injectable()
export class MandatesService {
    constructor(
        private readonly mandatesRepository: MandatesRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
    ) {}

    async getMandate(token: string) {
        const authId = await this.authId(token);
        const row = await this.mandatesRepository.getMandate(authId);
        const m = row?.mandate ?? null;
        const [balance, onChain] = await Promise.all([
            row?.nearAccountId ? this.mandatesRepository.getBalance(row.nearAccountId) : null,
            row?.nearAccountId ? this.chainMandate(row.nearAccountId) : null,
        ]);
        return {
            ...currentLimits(m),
            ...(onChain ?? {}),
            paused: onChain?.paused ?? m?.paused ?? false,
            pausedBy: m?.pausedBy ?? null,
            pausedAt: m?.pausedAt ?? null,
            usedToday: balance && sameDay(balance.dayStarted) ? Number(balance.spentToday) : 0,
            approvedSellers: (row?.approvedSellers ?? []).map((a) => ({ id: a.seller.id, name: a.seller.displayName, acct: a.seller.nearAccountId })),
            acct: row?.nearAccountId ?? '',
            agents: row?.agentsAccountId ?? '',
            saved: m !== null,
            lastTx: m?.lastTxHash ?? null,
        };
    }

    async editMandate(token: string, body: EditMandate) {
        const authId = await this.authId(token);
        const { row, next, approved, args } = await this.plan(authId, body);
        const acct = await this.ensureAccount(authId, row?.nearAccountId ?? null, row?.agentsAccountId ?? null);
        const tx = await this.chainService.callAs('owner', acct, 'set_mandate', args, '1');
        return { message: 'Limits Successfully Saved', ...next, approvedSellers: approved, txHash: tx.tx_hash, explorer: tx.explorer_url };
    }

    /**
     * Checks new limits the same way as editMandate but signs nothing. Returns the set_mandate arguments,
     * so the user's own wallet can sign the call (real chain mode, where the server has no key for the account).
     */
    async checkMandate(token: string, body: EditMandate) {
        const authId = await this.authId(token);
        const { row, next, approved, args } = await this.plan(authId, body);
        if (!row?.nearAccountId) throw new BadRequestException('Link your NEAR wallet first');
        return { message: 'Limits Checked', ...next, approvedSellers: approved, signer: row.nearAccountId, contract: this.chainService.walletChainInfo().contract, method: 'set_mandate', args };
    }

    private async plan(authId: string, body: EditMandate) {
        if (Object.values(body).every((v) => v === undefined)) throw new BadRequestException('Send at least one limit to change');
        const row = await this.mandatesRepository.getMandate(authId);
        const now = currentLimits(row?.mandate ?? null);
        const next = {
            perJobCap: body.per_job_cap ?? now.perJobCap,
            dailyCap: body.daily_cap ?? now.dailyCap,
            newSellerCap: body.new_seller_cap ?? now.newSellerCap,
            reviewWindowHours: body.review_window_hours ?? now.reviewWindowHours,
            categories: body.categories ?? now.categories,
            strict: body.strict ?? now.strict,
        };
        if (next.perJobCap > next.dailyCap) throw new BadRequestException('The per-job cap cannot be above the daily cap');
        if (next.newSellerCap > next.perJobCap) throw new BadRequestException('The new-seller cap cannot be above the per-job cap');
        if (!next.categories.length) throw new BadRequestException('Allow at least one category');
        const known = await this.mandatesRepository.findCategories(next.categories);
        const unknown = next.categories.filter((c) => !known.includes(c));
        if (unknown.length) throw new BadRequestException(`Unknown category: ${unknown.join(', ')}`);
        const approved = body.approved_sellers ?? (row?.approvedSellers ?? []).map((a) => a.seller.nearAccountId);
        if (body.approved_sellers?.length) {
            const found = await this.mandatesRepository.findSellers(body.approved_sellers);
            const missing = body.approved_sellers.filter((a) => !found.includes(a));
            if (missing.length) throw new BadRequestException(`Not a seller: ${missing.join(', ')}`);
        }
        const args = {
            per_job_cap: units(next.perJobCap),
            daily_cap: units(next.dailyCap),
            new_seller_cap: units(next.newSellerCap),
            review_timeout_hours: next.reviewWindowHours,
            categories: next.categories,
            strict: next.strict,
            approved_sellers: approved,
        };
        return { row, next, approved, args };
    }

    async pauseAgents(token: string) {
        const authId = await this.authId(token);
        const row = await this.mandatesRepository.getMandate(authId);
        if (row?.mandate?.paused) throw new ConflictException('Your agents are already paused');
        const acct = await this.ensureAccount(authId, row?.nearAccountId ?? null, row?.agentsAccountId ?? null);
        const tx = await this.chainService.callAs('owner', acct, 'pause', {});
        return { message: 'Agents Successfully Paused', paused: true, txHash: tx.tx_hash, explorer: tx.explorer_url };
    }

    async unpauseAgents(token: string) {
        const authId = await this.authId(token);
        const row = await this.mandatesRepository.getMandate(authId);
        if (!row?.mandate?.paused) throw new ConflictException('Your agents are not paused');
        const tx = await this.chainService.callAs('owner', row.nearAccountId!, 'unpause', {}, '1');
        return { message: 'Agents Successfully Unpaused', paused: false, txHash: tx.tx_hash, explorer: tx.explorer_url };
    }

    /** Real chain mode: the limits as the contract has them (the DB copy can lag behind a wallet-signed change). Null in mock mode or if the read fails. */
    private async chainMandate(accountId: string) {
        if (this.chainService.isMock()) return null;
        try {
            const c = await this.chainService.view<ChainMandate>('get_mandate', { account_id: accountId });
            return {
                perJobCap: Number(c.per_job_cap) / 1_000_000,
                dailyCap: Number(c.daily_cap) / 1_000_000,
                newSellerCap: Number(c.new_seller_cap) / 1_000_000,
                reviewWindowHours: c.review_timeout_hours,
                categories: c.categories,
                strict: c.strict,
                paused: c.paused,
            };
        } catch {
            return null;
        }
    }

    private async ensureAccount(authId: string, acct: string | null, agents: string | null): Promise<string> {
        if (acct && agents) return acct;
        const created = await this.chainService.createAccount(authId);
        const near = acct ?? created.account_id;
        await this.mandatesRepository.setAccountIds(authId, near, agents ?? created.agents_account_id);
        return near;
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }
}
