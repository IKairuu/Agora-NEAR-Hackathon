import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { DisputeContext, IndexerRepository, JobRef, MANDATE_DEFAULTS } from './indexer.repository.js';

export const MOCK_START_BALANCE = 120;
const REFUND_METHODS = ['refund_milestone', 'refund_expired'];
export const ESCALATION_WINDOW_MS = 72 * 60 * 60 * 1000;
export const MAX_REASON_LEN = 500;
const BOND_BPS = 500n;
const MIN_BOND = 1_000_000n;
const DISPUTE_METHODS = ['open_dispute', 'ft_transfer_call', 'resolve_dispute', 'finalize_default'];
export const STARTER_STAKE = 10;
export const STAKED_SELLER_CAP = 60;
const NEW_SELLER_SETTLED_JOBS = 3;

export type Party = 'buyer' | 'seller';
export type Outcome = 'release' | 'refund' | 'split';
type DecimalLike = Prisma.Decimal | number | string;

const baseUnits = (usdc: DecimalLike): bigint => BigInt(new Prisma.Decimal(usdc).mul(1_000_000).toFixed(0, Prisma.Decimal.ROUND_DOWN));
const fromUnits = (units: bigint): Prisma.Decimal => new Prisma.Decimal(units.toString()).div(1_000_000);

export const bondNeeded = (price: DecimalLike): number => {
    const p = baseUnits(price);
    const pct = (p * BOND_BPS) / 10_000n;
    return Number(fromUnits(pct > MIN_BOND ? pct : MIN_BOND));
};

export const settlementOf = (price: DecimalLike, sellerShareBps: number, feeBps: number) => {
    const p = baseUnits(price);
    const gross = (p * BigInt(sellerShareBps)) / 10_000n;
    const fee = (gross * BigInt(feeBps)) / 10_000n;
    return { sellerAmount: fromUnits(gross - fee), buyerAmount: fromUnits(p - gross), fee: fromUnits(fee) };
};

export const bondJobOf = (msg: unknown): string | null => (typeof msg === 'string' && msg.startsWith('dispute_bond:') ? msg.slice('dispute_bond:'.length) : null);

export const isStakeCall = (call: Pick<MockCall, 'method' | 'args'>): boolean => call.method === 'ft_transfer_call' && call.args['msg'] === 'starter_stake';

export const ownerOf = (account: string): string => (account.startsWith('agents.') ? account.slice('agents.'.length) : account);

export const partyOf = (ctx: Pick<DisputeContext, 'buyer' | 'seller'>, signer: string): Party | null => {
    const who = ownerOf(signer);
    if (ctx.buyer.nearAccountId && who === ctx.buyer.nearAccountId) return 'buyer';
    if (ctx.seller && (who === ctx.seller.nearAccountId || signer === ctx.seller.nearAccountId)) return 'seller';
    return null;
};

export const claimOf = (party: Party): 'release' | 'refund' => (party === 'buyer' ? 'refund' : 'release');

export const jobRefOf = (value: unknown): JobRef | null => {
    const v = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    if (typeof v !== 'string') return null;
    if (/^\d{1,19}$/.test(v)) return { onchainId: BigInt(v) };
    if (/^J-\d+$/.test(v)) return { ref: v };
    if (/^[0-9a-f-]{36}$/i.test(v)) return { id: v };
    return null;
};

export const usdcOf = (units: unknown): number => {
    const n = Number(typeof units === 'string' || typeof units === 'number' ? units : NaN);
    return Number.isFinite(n) ? n / 1_000_000 : NaN;
};

const sameDay = (a: Date | null): boolean => a !== null && a.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

export interface MockCall {
    signer: string;
    method: string;
    args: Record<string, unknown>;
    txHash: string;
}

type FundingContext = NonNullable<Awaited<ReturnType<IndexerRepository['getFundingContext']>>>;

export const fundingRefusal = (
    job: FundingContext,
    balance: { available: Prisma.Decimal; spentToday: Prisma.Decimal; dayStarted: Date | null } | null,
    sellerSettled: number,
    startBalance: number,
): string | null => {
    if (job.status !== 'agreed' || job.agreedPrice === null || !job.seller) return 'Job is not accepted';
    const price = Number(job.agreedPrice);
    const m = job.buyer.mandate;
    const perJob = m ? Number(m.perJobCap) : MANDATE_DEFAULTS.perJobCap;
    const daily = m ? Number(m.dailyCap) : MANDATE_DEFAULTS.dailyCap;
    const newSeller = m ? Number(m.newSellerCap) : MANDATE_DEFAULTS.newSellerCap;
    const cats = m ? m.allowedCategories : MANDATE_DEFAULTS.allowedCategories;
    const spent = balance && sameDay(balance.dayStarted) ? Number(balance.spentToday) : 0;
    const available = balance ? Number(balance.available) : startBalance;
    if (m?.paused) return 'Paused';
    if (price > perJob) return 'Over per-job cap';
    if (spent + price > daily) return 'Over daily cap';
    if (!cats.includes(job.category)) return 'Category not allowed';
    if (m?.strictSellers && !job.buyer.approvedSellers.some((a) => a.sellerId === job.seller!.id)) return 'Seller not approved';
    if ((job.acceptedBid?.fraudScore ?? 0) >= 70) return 'Bid flagged';
    if (job.acceptedBid?.priceCheck === 'held' && !job.acceptedBid.ownerApprovedRisk) return 'Bid held by price check';
    const stake = job.seller.stake === undefined || job.seller.stake === null ? 0 : Number(job.seller.stake);
    const newSellerCap = stake >= STARTER_STAKE ? Math.max(newSeller, STAKED_SELLER_CAP) : newSeller;
    if (sellerSettled < NEW_SELLER_SETTLED_JOBS && price > newSellerCap) return 'Over new-seller cap';
    if (available < price) return 'Not enough free balance';
    return null;
};

export const disputeRefusal = (
    call: Pick<MockCall, 'signer' | 'method' | 'args'>,
    ctx: DisputeContext | null,
    now: number,
    daoAccount: string,
    signerFree: number,
): string | null => {
    if (call.method === 'resolve_dispute' && call.signer !== daoAccount) return 'Only the DAO can resolve a dispute';
    if (call.method === 'ft_transfer_call') {
        if (bondJobOf(call.args['msg']) === null) return 'Unsupported deposit message';
        if (!(usdcOf(call.args['amount']) > 0)) return 'Amount must be positive';
    }
    if (!ctx) return 'Job not found';
    const milestone = ctx.milestones[0];
    const dispute = milestone?.disputes[0] ?? null;
    if (call.method === 'open_dispute') {
        if (!partyOf(ctx, call.signer)) return 'Only the buyer or seller can open a dispute';
        const delivered = ['delivered', 'reviewed'].includes(ctx.status) || (['funded', 'in_progress'].includes(ctx.status) && (milestone?._count.deliveries ?? 0) > 0);
        if (!milestone || !delivered) return 'Only a delivered job can be disputed';
        const reason = typeof call.args['reason'] === 'string' ? call.args['reason'] : '';
        if (!reason.trim()) return 'Reason is required';
        if (reason.length > MAX_REASON_LEN) return 'Reason is too long';
        if (dispute) return 'This job was already disputed';
        return null;
    }
    if (ctx.status !== 'disputed' || !dispute) return 'Job is not disputed';
    if (call.method === 'ft_transfer_call') {
        const party = partyOf(ctx, call.signer);
        if (!party) return 'Only the buyer or seller can escalate';
        if (dispute.escalatedAt) return 'Dispute is already escalated';
        if (!dispute.recheckOutcome || !dispute.recheckAt) return 'Wait for the re-check result';
        if (now >= dispute.recheckAt.getTime() + ESCALATION_WINDOW_MS) return 'The escalation window has closed';
        if (dispute.recheckOutcome === claimOf(party)) return 'The re-check already agrees with you';
        const amount = usdcOf(call.args['amount']);
        if (amount < bondNeeded(ctx.agreedPrice ?? milestone.amount)) return 'Bond is below 5% of the price (minimum 1 USDC)';
        if (signerFree < amount) return 'Not enough free balance';
        return null;
    }
    if (call.method === 'resolve_dispute') {
        if (!dispute.escalatedAt) return 'The dispute was not escalated';
        const outcome = call.args['outcome'];
        const bps = Number(call.args['seller_share_bps']);
        if (outcome === 'split' && !(Number.isInteger(bps) && bps > 0 && bps < 10_000)) return 'A split needs a share between 1 and 9999';
        if (!['release', 'refund', 'split'].includes(outcome as string)) return 'Outcome must be release, refund or split';
        return null;
    }
    if (call.method === 'finalize_default') {
        if (!dispute.recheckOutcome || !dispute.recheckAt) return 'The re-check has no result yet';
        const since = (dispute.escalatedAt ?? dispute.recheckAt).getTime();
        if (now < since + ESCALATION_WINDOW_MS) return 'Wait 72 hours before finalizing';
    }
    return null;
};

type RatingContext = NonNullable<Awaited<ReturnType<IndexerRepository['getRatingContext']>>>;

export const rateRefusal = (call: Pick<MockCall, 'signer' | 'args'>, job: RatingContext | null): string | null => {
    if (!job) return 'Job not found';
    if (!['released', 'settled'].includes(job.status)) return 'Only a paid job can be rated';
    const stars = Number(call.args['stars']);
    if (!(Number.isInteger(stars) && stars >= 1 && stars <= 5)) return 'Stars must be between 1 and 5';
    const party = partyOf(job, call.signer);
    if (!party) return 'Only the buyer or seller can rate';
    const rater = party === 'buyer' ? job.buyerId : job.seller?.ownerId;
    if (job.ratings.some((r) => r.raterId === rater)) return 'You already rated this job';
    return null;
};

export const stakeRefusal = (
    call: Pick<MockCall, 'method' | 'args'>,
    ctx: Awaited<ReturnType<IndexerRepository['getStakeContext']>>,
    free: number,
): string | null => {
    if (call.method === 'return_stake') {
        if (!ctx.seller || !(Number(ctx.seller.stake) > 0)) return 'Nothing staked';
        if (ctx.settled < NEW_SELLER_SETTLED_JOBS || ctx.disputes !== 0) return 'The stake comes back after 3 settled jobs with no disputes';
        return null;
    }
    const amount = usdcOf(call.args['amount']);
    if (!(amount > 0)) return 'Amount must be positive';
    if (!ctx.seller) return 'Only a registered seller can stake';
    if (free < amount) return 'Not enough free balance';
    return null;
};

@Injectable()
export class IndexerService {
    now: () => number = () => Date.now();

    constructor(private readonly indexerRepository: IndexerRepository) {}

    private feeBps(): number {
        return Number(process.env['AGORA_FEE_BPS'] ?? '200');
    }

    private dao(): string {
        return process.env['AGORA_DAO_ACCOUNT'] ?? 'agora-dao.sputnikv2.testnet';
    }

    async onMockCall(call: MockCall) {
        if (isStakeCall(call) || call.method === 'return_stake') return this.onStakeCall(call);
        const jobKey = jobRefOf(call.method === 'ft_transfer_call' ? bondJobOf(call.args['msg']) : call.args['job_id']);
        const refusal = await this.refusalFor(call, jobKey);
        await this.indexerRepository.recordTx({
            txHash: call.txHash, signer: call.signer, method: call.method, args: call.args as Prisma.InputJsonValue, ok: refusal === null, error: refusal, jobKey,
        });
        if (refusal) throw new BadRequestException(`Contract refused ${call.method}: ${refusal}`);

        if (DISPUTE_METHODS.includes(call.method) && jobKey) return this.applyDispute(call, jobKey);
        if (call.method === 'fund_job' && jobKey) return this.indexerRepository.fundJob(jobKey, call.txHash, MOCK_START_BALANCE);
        if (REFUND_METHODS.includes(call.method) && jobKey) return this.indexerRepository.refundJob(jobKey, call.txHash);
        if (call.method === 'deposit') {
            const owner = await this.indexerRepository.findOwner(call.signer);
            return this.indexerRepository.deposit(call.signer, owner?.id ?? null, usdcOf(call.args['amount']), MOCK_START_BALANCE);
        }
        if (call.method === 'withdraw') return this.indexerRepository.withdraw(call.signer, usdcOf(call.args['amount']));
        if (['set_mandate', 'pause', 'unpause'].includes(call.method)) {
            const owner = await this.indexerRepository.findOwner(call.signer);
            if (!owner) return null;
            if (call.method === 'set_mandate') {
                return this.indexerRepository.setMandate(owner.id, {
                    perJobCap: usdcOf(call.args['per_job_cap']),
                    dailyCap: usdcOf(call.args['daily_cap']),
                    newSellerCap: usdcOf(call.args['new_seller_cap']),
                    reviewWindowHours: Number(call.args['review_timeout_hours']),
                    allowedCategories: (call.args['categories'] as string[]) ?? [],
                    strictSellers: Boolean(call.args['strict']),
                }, Array.isArray(call.args['approved_sellers']) ? (call.args['approved_sellers'] as string[]) : [], call.txHash);
            }
            return this.indexerRepository.setPaused(owner.id, call.method === 'pause', call.signer, call.txHash);
        }
        return null;
    }

    async onMockRelease(jobId: string, txHash: string) {
        const fee = this.feeBps();
        const dao = this.dao();
        await this.indexerRepository.recordTx({
            txHash, signer: 'reviewers', method: 'vote', args: { job_id: jobId, approve: true }, ok: true, error: null, jobKey: { id: jobId },
        });
        return this.indexerRepository.releaseJob({ id: jobId }, txHash, fee, dao);
    }

    private async onStakeCall(call: MockCall) {
        const ctx = await this.indexerRepository.getStakeContext(call.signer);
        const balance = call.method === 'return_stake' ? null : await this.indexerRepository.getBalance(call.signer);
        const free = balance ? Number(balance.available) : MOCK_START_BALANCE;
        const refusal = stakeRefusal(call, ctx, free);
        await this.indexerRepository.recordTx({
            txHash: call.txHash, signer: call.signer, method: call.method, args: call.args as Prisma.InputJsonValue, ok: refusal === null, error: refusal, jobKey: null,
        });
        if (refusal) throw new BadRequestException(`Contract refused ${call.method}: ${refusal}`);
        if (call.method === 'return_stake') return this.indexerRepository.returnStake(call.signer);
        return this.indexerRepository.addStake(call.signer, usdcOf(call.args['amount']), call.txHash, MOCK_START_BALANCE);
    }

    private async applyDispute(call: MockCall, jobKey: JobRef) {
        const ctx = await this.indexerRepository.getDisputeContext(jobKey);
        if (!ctx) return null;
        const at = new Date(this.now());
        if (call.method === 'open_dispute') {
            const party = partyOf(ctx, call.signer)!;
            return this.indexerRepository.openDispute(jobKey, party, String(call.args['reason']), at);
        }
        if (call.method === 'ft_transfer_call') {
            const party = partyOf(ctx, call.signer)!;
            return this.indexerRepository.escalateDispute(jobKey, {
                signer: call.signer, party, claim: claimOf(party), bond: usdcOf(call.args['amount']), txHash: call.txHash, at, startBalance: MOCK_START_BALANCE,
            });
        }
        const dispute = ctx.milestones[0]!.disputes[0]!;
        const outcome = (call.method === 'resolve_dispute' ? call.args['outcome'] : dispute.recheckOutcome) as Outcome;
        const bps = outcome === 'release' ? 10_000 : outcome === 'refund' ? 0 : Number(call.args['seller_share_bps']);
        return this.indexerRepository.settleDispute(jobKey, {
            outcome, sellerShareBps: bps, by: call.method === 'resolve_dispute' ? 'dao' : 'default', txHash: call.txHash, at, ...settlementOf(ctx.agreedPrice ?? ctx.milestones[0]!.amount, bps, this.feeBps()), daoAccount: this.dao(),
        });
    }

    private async refusalFor(call: MockCall, jobKey: JobRef | null): Promise<string | null> {
        if (DISPUTE_METHODS.includes(call.method)) {
            const ctx = jobKey ? await this.indexerRepository.getDisputeContext(jobKey) : null;
            let free = 0;
            if (call.method === 'ft_transfer_call') {
                const balance = await this.indexerRepository.getBalance(call.signer);
                free = balance ? Number(balance.available) : MOCK_START_BALANCE;
            }
            return disputeRefusal(call, ctx, this.now(), this.dao(), free);
        }
        if (call.method === 'rate') {
            const job = jobKey ? await this.indexerRepository.getRatingContext(jobKey) : null;
            return rateRefusal(call, job);
        }
        if (call.method === 'fund_job') {
            if (!jobKey) return 'Unknown job';
            const job = await this.indexerRepository.getFundingContext(jobKey);
            if (!job) return 'Unknown job';
            const balance = job.buyer.nearAccountId ? await this.indexerRepository.getBalance(job.buyer.nearAccountId) : null;
            const settled = job.seller ? await this.indexerRepository.getSettledJobs(job.seller.nearAccountId) : 0;
            return fundingRefusal(job, balance, settled, MOCK_START_BALANCE);
        }
        if (call.method === 'withdraw') {
            const amount = usdcOf(call.args['amount']);
            if (!(amount > 0)) return 'Amount must be above 0';
            const balance = await this.indexerRepository.getBalance(call.signer);
            const available = balance ? Number(balance.available) : 0;
            if (available < amount) return 'Not enough free balance';
        }
        if (call.method === 'deposit' && !(usdcOf(call.args['amount']) > 0)) return 'Amount must be above 0';
        return null;
    }
}
