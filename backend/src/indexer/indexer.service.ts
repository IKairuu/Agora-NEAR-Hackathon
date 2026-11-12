import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { DisputeContext, IndexerRepository, JobRef, MANDATE_DEFAULTS } from './indexer.repository.js';

export const MOCK_START_BALANCE = 120;
const REFUND_METHODS = ['refund_milestone', 'refund_expired', 'grant_attempt'];
export const BASE_ATTEMPTS = 3;
export const DEADLINE_GRACE_DAYS = 3;
export const DEFAULT_DELIVERY_DAYS = 14;
export const ESCALATION_WINDOW_MS = 72 * 60 * 60 * 1000;
export const MAX_REASON_LEN = 500;
const BOND_BPS = 500n;
const MIN_BOND = 1_000_000n;
const DISPUTE_METHODS = ['open_dispute', 'ft_transfer_call', 'resolve_dispute', 'finalize_default'];
export const STARTER_STAKE = 10;
export const STAKED_SELLER_CAP = 60;
const NEW_SELLER_SETTLED_JOBS = 3;
const MAX_BIDS_PER_JOB = 20;
const LISTING_METHODS = ['post_job', 'place_bid', 'accept_offer', 'set_bid_flags'];

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

type RefundContext = NonNullable<Awaited<ReturnType<IndexerRepository['getRefundContext']>>>;

export const deadlineOf = (ctx: Pick<RefundContext, 'fundedAt' | 'deliveryDays'>): Date | null =>
    ctx.fundedAt ? new Date(ctx.fundedAt.getTime() + ((ctx.deliveryDays ?? DEFAULT_DELIVERY_DAYS) + DEADLINE_GRACE_DAYS) * 86_400_000) : null;

export const refundRefusal = (call: Pick<MockCall, 'signer' | 'method'>, ctx: RefundContext | null, now: number): string | null => {
    if (!ctx) return 'Job not found';
    if (call.method === 'refund_expired') {
        const deadline = deadlineOf(ctx);
        if (!deadline || now <= deadline.getTime()) return 'Deadline has not passed';
        if (!['funded', 'in_progress', 'delivered', 'reviewed'].includes(ctx.status)) return 'Nothing to refund';
        return null;
    }
    if (!ctx.buyerAccount || ownerOf(call.signer) !== ctx.buyerAccount) return call.method === 'grant_attempt' ? 'Only the buyer can grant an attempt' : 'Only the buyer can refund';
    const exhausted = ['funded', 'in_progress'].includes(ctx.status)
        && ctx.lastAttempt > 0
        && ctx.lastAttempt >= BASE_ATTEMPTS + ctx.extraAttempts
        && ctx.lastDeliveryStatus === 'rejected';
    return exhausted ? null : 'Refund is allowed after the last attempt fails';
};

export const jobRefOf = (value: unknown): JobRef | null => {
    const v = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    if (typeof v !== 'string') return null;
    if (/^\d{1,19}$/.test(v)) return { onchainId: BigInt(v) };
    if (/^J-\d+$/.test(v)) return { ref: v };
    if (/^[0-9a-f-]{36}$/i.test(v)) return { id: v };
    return null;
};

export const jobKeyOf = (call: Pick<MockCall, 'method' | 'args'>): JobRef | null =>
    jobRefOf(call.method === 'ft_transfer_call' ? bondJobOf(call.args['msg']) : call.args['job_id']);

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

export type BidKey = { onchainId: bigint } | { id: string };

export const bidRefOf = (value: unknown): BidKey | null => {
    const v = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    if (typeof v !== 'string') return null;
    if (/^\d{1,19}$/.test(v)) return { onchainId: BigInt(v) };
    if (/^[0-9a-f-]{36}$/i.test(v)) return { id: v };
    return null;
};

const bigOf = (value: unknown): bigint | null => {
    const v = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    return typeof v === 'string' && /^\d{1,39}$/.test(v) ? BigInt(v) : null;
};

const filled = (value: unknown): boolean => typeof value === 'string' && value.length > 0;

const futureRefusal = (deadline: unknown, nowNs: bigint): string | null => {
    const d = bigOf(deadline);
    return d === null || d <= nowNs ? 'Deadline must be in the future' : null;
};

type ChainJob = NonNullable<Awaited<ReturnType<IndexerRepository['getChainJob']>>>;
type ChainBid = NonNullable<Awaited<ReturnType<IndexerRepository['getChainBid']>>>;

export const postJobRefusal = (args: Record<string, unknown>, nowNs: bigint): string | null => {
    if (!filled(args['category'])) return 'Category is required';
    if (!filled(args['spec_hash'])) return 'Spec hash is required';
    return futureRefusal(args['deadline'], nowNs);
};

export const placeBidRefusal = (
    call: Pick<MockCall, 'signer' | 'args'>,
    ctx: { registered: boolean; job: ChainJob | null; bidsOnJob: number; alreadyBid: boolean },
): string | null => {
    if (!ctx.registered) return 'Not a registered seller';
    const price = bigOf(call.args['price']);
    if (price === null || price <= 0n) return 'Price must be positive';
    const days = Number(call.args['days']);
    if (!(Number.isInteger(days) && days > 0)) return 'Days must be positive';
    if (!ctx.job) return 'Job not found';
    if (!['open', 'negotiating'].includes(ctx.job.status)) return 'Job is not open for bids';
    if (ctx.job.buyer.nearAccountId && ctx.job.buyer.nearAccountId === ownerOf(call.signer)) return 'Cannot bid on your own job';
    if (ctx.bidsOnJob >= MAX_BIDS_PER_JOB) return 'Too many bids on this job';
    if (ctx.alreadyBid) return 'Seller already bid on this job';
    return null;
};

export const acceptOfferRefusal = (
    call: Pick<MockCall, 'signer' | 'args'>,
    ctx: { job: ChainJob | null; alreadyAccepted: boolean; bid: ChainBid | null },
    nowNs: bigint,
): string | null => {
    const { job, bid } = ctx;
    if (!job) return 'Job not found';
    if (!job.buyer.nearAccountId || job.buyer.nearAccountId !== ownerOf(call.signer)) return 'Only the buyer can accept an offer';
    if (ctx.alreadyAccepted || !['open', 'negotiating', 'agreed'].includes(job.status)) return 'Job is not open';
    if (!bid) return 'Bid not found';
    if (bid.jobId !== job.id) return 'Bid is not on this job';
    if (bid.seller.ownerId === job.buyerId || ownerOf(bid.seller.nearAccountId) === job.buyer.nearAccountId) return 'Self-dealing: seller is the buyer';
    const price = bigOf(call.args['price']);
    if (price === null || price <= 0n || price > baseUnits(bid.price)) return 'Price must be positive and not above the bid';
    if (!filled(call.args['spec_hash'])) return 'Spec hash is required';
    if (!filled(call.args['holdout_hash'])) return 'Holdout hash is required';
    if (!(Number(call.args['attempts']) >= 1)) return 'At least one attempt';
    return futureRefusal(call.args['deadline'], nowNs);
};

export const bidFlagsRefusal = (call: Pick<MockCall, 'signer' | 'args'>, oracle: string, bid: ChainBid | null, jobId: string | null): string | null => {
    if (call.signer !== oracle) return 'Only the fraud oracle can flag bids';
    const score = Number(call.args['fraud_score']);
    if (!(Number.isInteger(score) && score >= 0 && score <= 100)) return 'Fraud score is 0 to 100';
    if (!bid) return 'Bid not found';
    if (bid.jobId !== jobId) return 'Bid is not on this job';
    return null;
};

export interface RealCall {
    txHash: string;
    signer: string;
    method: string;
    args: Record<string, unknown>;
    ok: boolean;
    error: string | null;
    jobKey: JobRef | null;
}

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

    private oracle(): string {
        return process.env['AGORA_FRAUD_ORACLE_ACCOUNT'] ?? 'oracle.agora-testnet.testnet';
    }

    private nowNs(): bigint {
        return BigInt(this.now()) * 1_000_000n;
    }

    async recordRealCall(call: RealCall) {
        return this.indexerRepository.recordTx({
            txHash: call.txHash, signer: call.signer, method: call.method, args: call.args as Prisma.InputJsonValue, ok: call.ok, error: call.error, jobKey: call.jobKey,
        });
    }

    async onMockCall(call: MockCall) {
        if (isStakeCall(call) || call.method === 'return_stake') return this.onStakeCall(call);
        const jobKey = jobKeyOf(call);
        const refusal = await this.refusalFor(call, jobKey);
        await this.indexerRepository.recordTx({
            txHash: call.txHash, signer: call.signer, method: call.method, args: call.args as Prisma.InputJsonValue, ok: refusal === null, error: refusal, jobKey,
        });
        if (refusal) throw new BadRequestException(`Contract refused ${call.method}: ${refusal}`);
        return this.applyCall(call);
    }

    async applyCall(call: MockCall) {
        if (isStakeCall(call)) return this.indexerRepository.addStake(call.signer, usdcOf(call.args['amount']), call.txHash, MOCK_START_BALANCE);
        if (call.method === 'return_stake') return this.indexerRepository.returnStake(call.signer);
        const jobKey = jobKeyOf(call);
        if (DISPUTE_METHODS.includes(call.method) && jobKey) return this.applyDispute(call, jobKey);
        if (call.method === 'fund_job' && jobKey) return this.indexerRepository.fundJob(jobKey, call.txHash, MOCK_START_BALANCE);
        if (call.method === 'grant_attempt') return null;
        if (REFUND_METHODS.includes(call.method) && jobKey) return this.indexerRepository.refundJob(jobKey, call.txHash, call.method === 'refund_expired' ? 'expired' : 'refunded');
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

    async hasTx(txHash: string): Promise<boolean> {
        return this.indexerRepository.hasTx(txHash);
    }

    async partiesOf(key: JobRef): Promise<string[]> {
        const ctx = await this.indexerRepository.getDisputeContext(key);
        if (!ctx) return [];
        return [ctx.buyer.nearAccountId, ctx.seller?.nearAccountId].filter((a): a is string => typeof a === 'string' && a.length > 0);
    }

    async syncBalance(accountId: string, free: number, escrowed: number) {
        return this.indexerRepository.syncBalance(accountId, free, escrowed);
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
        return this.applyCall(call);
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

    private async listingRefusal(call: MockCall, jobKey: JobRef | null): Promise<string | null> {
        if (call.method === 'post_job') return postJobRefusal(call.args, this.nowNs());
        const job = jobKey ? await this.indexerRepository.getChainJob(jobKey) : null;
        if (call.method === 'place_bid') {
            const registered = await this.indexerRepository.isSeller(ownerOf(call.signer));
            const bidsOnJob = job ? await this.indexerRepository.countSuccessTxs(job.id, 'place_bid') : 0;
            const alreadyBid = job ? (await this.indexerRepository.countSuccessTxs(job.id, 'place_bid', call.signer)) > 0 : false;
            return placeBidRefusal(call, { registered, job, bidsOnJob, alreadyBid });
        }
        const bidKey = bidRefOf(call.args['bid_id']);
        const bid = bidKey ? await this.indexerRepository.getChainBid(bidKey) : null;
        if (call.method === 'set_bid_flags') return bidFlagsRefusal(call, this.oracle(), bid, job?.id ?? null);
        const alreadyAccepted = job ? (await this.indexerRepository.countSuccessTxs(job.id, 'accept_offer')) > 0 : false;
        return acceptOfferRefusal(call, { job, alreadyAccepted, bid }, this.nowNs());
    }

    private async refusalFor(call: MockCall, jobKey: JobRef | null): Promise<string | null> {
        if (LISTING_METHODS.includes(call.method)) return this.listingRefusal(call, jobKey);
        if (DISPUTE_METHODS.includes(call.method)) {
            const ctx = jobKey ? await this.indexerRepository.getDisputeContext(jobKey) : null;
            let free = 0;
            if (call.method === 'ft_transfer_call') {
                const balance = await this.indexerRepository.getBalance(call.signer);
                free = balance ? Number(balance.available) : MOCK_START_BALANCE;
            }
            return disputeRefusal(call, ctx, this.now(), this.dao(), free);
        }
        if (REFUND_METHODS.includes(call.method)) {
            const ctx = jobKey ? await this.indexerRepository.getRefundContext(jobKey) : null;
            return refundRefusal(call, ctx, this.now());
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
