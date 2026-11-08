import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { IndexerRepository, JobRef, MANDATE_DEFAULTS } from './indexer.repository.js';

export const MOCK_START_BALANCE = 120;
const REFUND_METHODS = ['refund_milestone', 'refund_expired'];

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
    if (sellerSettled < 3 && price > newSeller) return 'Over new-seller cap';
    if (available < price) return 'Not enough free balance';
    return null;
};

@Injectable()
export class IndexerService {
    constructor(private readonly indexerRepository: IndexerRepository) {}

    async onMockCall(call: MockCall) {
        const jobKey = jobRefOf(call.args['job_id']);
        const refusal = await this.refusalFor(call, jobKey);
        await this.indexerRepository.recordTx({
            txHash: call.txHash, signer: call.signer, method: call.method, args: call.args as Prisma.InputJsonValue, ok: refusal === null, error: refusal, jobKey,
        });
        if (refusal) throw new BadRequestException(`Contract refused ${call.method}: ${refusal}`);

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
        const fee = Number(process.env['AGORA_FEE_BPS'] ?? '200');
        const dao = process.env['AGORA_DAO_ACCOUNT'] ?? 'agora-dao.sputnikv2.testnet';
        await this.indexerRepository.recordTx({
            txHash, signer: 'reviewers', method: 'vote', args: { job_id: jobId, approve: true }, ok: true, error: null, jobKey: { id: jobId },
        });
        return this.indexerRepository.releaseJob({ id: jobId }, txHash, fee, dao);
    }

    private async refusalFor(call: MockCall, jobKey: JobRef | null): Promise<string | null> {
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
