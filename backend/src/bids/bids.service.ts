import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AgentsService } from '../agents/agents.service.js';
import { AuthService } from '../auth/auth.service.js';
import { chainIdOf, chainJobId, ChainService, usdcUnits } from '../chain/chain.service.js';
import { CreateBid } from './dto/CreateBid.dto.js';
import { CreateBidBulk } from './dto/CreateBidBulk.dto.js';
import { EditBid } from './dto/EditBid.dto.js';
import { ExplainBid } from './dto/ExplainBid.dto.js';
import { BidRow, BidsRepository, JobKey, ReputationRow } from './bids.repository.js';

const BIDDABLE_STATUSES = ['open', 'negotiating'];

export interface PlaceResult {
    placed: boolean;
    onchainBidId: string | null;
    bidTx: string | null;
    bidError: string | null;
}
const MIN_OFFERS = 3;

const daysLabel = (days: number | null): string => (days === null ? '' : days === 1 ? '1 day' : `${days} days`);

export const toOffer = (row: BidRow, rep: ReputationRow | undefined) => {
    const negotiated = row.negotiationMessages[0]?.offeredPrice;
    const pass = rep?.firstTryPassRate !== null && rep?.firstTryPassRate !== undefined ? Number(rep.firstTryPassRate) : null;
    const settled = rep?.settledJobs ?? 0;
    return {
        key: row.seller.nearAccountId.split('.')[0] ?? row.seller.nearAccountId,
        bidId: row.id,
        sellerId: row.seller.id,
        name: row.seller.displayName,
        acct: row.seller.nearAccountId,
        kind: row.seller.kind,
        owner: row.seller.headline ?? '',
        price: Number(row.price),
        final: negotiated !== undefined && negotiated !== null ? Number(negotiated) : Number(row.price),
        days: daysLabel(row.deliveryDays),
        fraud: row.fraudScore ?? 0,
        settled,
        buyers: rep?.distinctBuyers ?? 0,
        pass: pass === null ? '—' : `${Math.round(pass)}%`,
        passRate: pass,
        disputes: rep?.disputedJobs ?? 0,
        note: row.note ?? '',
        newSeller: settled < 3,
        status: row.status,
        priceCheck: row.priceCheck,
        referenceMedian: row.referenceMedian === null ? null : Number(row.referenceMedian),
    };
};

export type Offer = ReturnType<typeof toOffer>;

export const toHeld = (row: BidRow) => ({
    bidId: row.id,
    name: row.seller.displayName,
    acct: row.seller.nearAccountId,
    kind: row.seller.kind,
    price: Number(row.price),
    fraud: row.fraudScore ?? 0,
    why: row.holdReason ?? 'Held for review',
    text: row.note ?? '',
    explanation: row.sellerExplanation,
    ownerApprovedRisk: row.ownerApprovedRisk,
});

export const bestPickOf = (offers: Offer[]): string | null => {
    const safe = offers.filter((o) => o.fraud < 30 && o.status !== 'pending_check');
    const trusted = safe.filter((o) => o.settled >= 3 && (o.passRate ?? 0) >= 85);
    const pool = trusted.length > 0 ? trusted : safe;
    return pool.length > 0 ? pool[0]!.key : null;
};

@Injectable()
export class BidsService {
    constructor(
        private readonly bidsRepository: BidsRepository,
        private readonly authService: AuthService,
        private readonly agentsService: AgentsService,
        private readonly chainService: ChainService,
    ) {}

    async createBid(token: string, body: CreateBid) {
        const authId = await this.authId(token);
        const plan = await this.planBid(authId, body);
        const row = await this.bidsRepository.createBid(plan);
        if (!row) throw new ConflictException('You already made an offer on this job. Edit it instead.');
        const chain = await this.placeBid(authId, plan, row);
        await this.checkBid(plan.buyerId, plan.jobId, row.id);
        return { message: 'Bid Successfully Created', id: row.id, ...chain };
    }

    async createBids(token: string, body: CreateBidBulk) {
        const authId = await this.authId(token);
        const ids: string[] = [];
        const onchain: (PlaceResult & { id: string })[] = [];
        for (const item of body.items) {
            const plan = await this.planBid(authId, item);
            const row = await this.bidsRepository.createBid(plan);
            if (!row) throw new ConflictException(`You already made an offer on ${item.job_id}`);
            onchain.push({ id: row.id, ...(await this.placeBid(authId, plan, row)) });
            await this.checkBid(plan.buyerId, plan.jobId, row.id);
            ids.push(row.id);
        }
        return { message: 'Bids Successfully Created', ids, onchain };
    }

    async getBids(token: string, job: string) {
        const authId = await this.authId(token);
        const owned = await this.bidsRepository.getOwnedJob(authId, this.jobKey(job));
        if (!owned) throw new NotFoundException('Job not found');
        const rows = await this.bidsRepository.getBids(owned.id);
        const reps = await this.bidsRepository.getReputations([...new Set(rows.map((r) => r.seller.nearAccountId))]);
        const repOf = new Map(reps.map((r) => [r.accountId, r]));
        const offers = rows
            .filter((r) => r.status !== 'held')
            .map((r) => toOffer(r, repOf.get(r.seller.nearAccountId)))
            .sort((a, b) => a.final - b.final);
        const held = rows.filter((r) => r.status === 'held').map(toHeld);
        return { offers, held, bestPick: bestPickOf(offers), waitingFor: Math.max(0, MIN_OFFERS - offers.length) };
    }

    async editBid(token: string, body: EditBid) {
        const authId = await this.authId(token);
        const bid = await this.ownedBid(authId, body.id);
        if (!BIDDABLE_STATUSES.includes(bid.job.status)) throw new BadRequestException('This job no longer takes offers');
        const count = await this.bidsRepository.editBid(authId, body.id, { price: body.price, days: body.days, note: body.note ?? null });
        if (count === 0) throw new BadRequestException('This offer can no longer change');
        return { message: 'Bid Successfully Edited', id: body.id };
    }

    async explainBid(token: string, id: string, body: ExplainBid) {
        const authId = await this.authId(token);
        const bid = await this.ownedBid(authId, id);
        if (bid.status !== 'held') throw new BadRequestException('Only a held offer needs an explanation');
        const count = await this.bidsRepository.explainBid(authId, id, body.explanation.trim());
        if (count === 0) throw new BadRequestException('Only a held offer needs an explanation');
        return { message: 'Bid Explanation Successfully Sent', id };
    }

    async deleteBid(token: string, id: string) {
        const authId = await this.authId(token);
        await this.ownedBid(authId, id);
        const count = await this.bidsRepository.deleteBid(authId, id);
        if (count === 0) throw new BadRequestException('This offer can no longer be withdrawn');
        return { message: 'Bid Successfully Withdrawn', id };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job ?? '')) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }

    private async ownedBid(authId: string, id: string) {
        if (!isUUID(id)) throw new BadRequestException('Bid id must be a valid id');
        const bid = await this.bidsRepository.getOwnedBid(authId, id);
        if (!bid) throw new NotFoundException('Offer not found');
        return bid;
    }

    private async planBid(authId: string, body: CreateBid) {
        const job = await this.bidsRepository.getJobForBidding(this.jobKey(body.job_id));
        if (!job || job.visibility === 'private') throw new NotFoundException('Job not found');
        if (job.buyerId === authId) throw new ForbiddenException('You cannot make an offer on your own job');
        if (!BIDDABLE_STATUSES.includes(job.status)) throw new BadRequestException('This job no longer takes offers');
        const sellers = await this.bidsRepository.getMySellers(authId);
        if (sellers.length === 0) throw new ForbiddenException('Set up your seller profile before making offers');
        const seller = body.seller_id ? sellers.find((s) => s.id === body.seller_id) : sellers[0];
        if (!seller) throw new ForbiddenException('That seller account is not yours');
        if (job.visibility === 'direct') {
            const service = job.serviceId ? await this.bidsRepository.getServiceSeller(job.serviceId) : null;
            if (!service || service.sellerId !== seller.id) throw new ForbiddenException('This request was sent to another seller');
        }
        return {
            jobId: job.id, buyerId: job.buyerId, sellerId: seller.id, price: body.price, days: body.days, note: body.note?.trim() || null,
            sellerAccount: seller.nearAccountId, chainJobId: chainJobId(job),
        };
    }

    private async placeBid(
        authId: string,
        plan: { price: number; days: number; sellerAccount: string; chainJobId: string },
        row: { id: string; onchainId: bigint | null; onchainTx: string | null },
    ): Promise<PlaceResult> {
        if (row.onchainId !== null) return { placed: true, onchainBidId: row.onchainId.toString(), bidTx: row.onchainTx, bidError: null };
        try {
            const tx = await this.chainService.callAs('owner', plan.sellerAccount, 'place_bid', { job_id: plan.chainJobId, price: usdcUnits(plan.price), days: plan.days });
            const onchainId = chainIdOf(tx.result);
            if (onchainId === null) throw new BadRequestException('place_bid returned no bid id');
            await this.bidsRepository.setOnchainBid(authId, row.id, onchainId, tx.tx_hash);
            return { placed: true, onchainBidId: onchainId.toString(), bidTx: tx.tx_hash, bidError: null };
        } catch (e) {
            return { placed: false, onchainBidId: null, bidTx: null, bidError: e instanceof Error ? e.message : 'Placing the bid on chain failed' };
        }
    }

    private async checkBid(buyerId: string, jobId: string, bidId: string) {
        await this.agentsService.dispatch('fraud_lure', { ownerId: buyerId, jobId, payload: { subjectType: 'bid', subjectId: bidId } });
    }
}
