import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { chainBidId, chainJobId, ChainService, deadlineIn, usdcUnits } from '../chain/chain.service.js';
import { CreateNegotiation } from './dto/CreateNegotiation.dto.js';
import { CreateNegotiationBulk } from './dto/CreateNegotiationBulk.dto.js';
import { HireSeller } from './dto/HireSeller.dto.js';
import { BidContext, JobKey, NegotiationsRepository, OfferRow } from './negotiations.repository.js';

export const MAX_ROUNDS = 3;
const NEGOTIABLE_JOB = ['open', 'negotiating'];
const HIREABLE_BID = ['pending_check', 'live', 'shortlisted'];
export const ACCEPT_ATTEMPTS = 3;
export const ACCEPT_GRACE_DAYS = 3;
export const NO_HOLDOUT = 'none';

export interface ChainAccept {
    accepted: boolean;
    acceptTx: string | null;
    acceptError: string | null;
    funded: boolean;
    fundTx: string | null;
    fundError: string | null;
}

const OFFER_STATE: Record<string, string> = { sent: 'wait', accepted: 'accepted', declined: 'declined' };

export const nextRound = (ctx: BidContext, sender: 'buyer' | 'seller'): number => {
    const current = ctx.negotiationMessages.reduce((max, m) => Math.max(max, m.round), 0);
    if (sender === 'seller') return current;
    if (current >= MAX_ROUNDS) throw new BadRequestException(`Negotiation is limited to ${MAX_ROUNDS} rounds`);
    return current + 1;
};

export const agreedPriceOf = (ctx: BidContext): number => {
    const sellerOffer = ctx.negotiationMessages.find((m) => m.sender === 'seller' && m.offeredPrice !== null);
    return sellerOffer?.offeredPrice !== undefined && sellerOffer.offeredPrice !== null ? Number(sellerOffer.offeredPrice) : Number(ctx.price);
};

const toOfferView = (row: OfferRow) => ({
    id: row.id,
    jobId: row.job.ref,
    bidId: row.bidId,
    seller: row.seller.displayName,
    price: Number(row.price),
    offerSt: OFFER_STATE[row.status] ?? '',
    status: row.status,
});

@Injectable()
export class NegotiationsService {
    constructor(
        private readonly negotiationsRepository: NegotiationsRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
    ) {}

    async createNegotiation(token: string, body: CreateNegotiation) {
        const authId = await this.authId(token);
        const ctx = await this.bidContext(authId, body.bid_id);
        const sender = ctx.job.buyerId === authId ? 'buyer' : 'seller';
        if (!NEGOTIABLE_JOB.includes(ctx.job.status)) throw new BadRequestException('Negotiation is closed for this job');
        if (!HIREABLE_BID.includes(ctx.status)) throw new BadRequestException('This offer is not open for negotiation');
        const round = nextRound(ctx, sender);
        const row = await this.negotiationsRepository.createNegotiation({
            jobId: ctx.job.id,
            bidId: ctx.id,
            round,
            sender,
            body: body.text.trim(),
            price: body.price ?? null,
            openJob: sender === 'buyer',
        });
        return { message: 'Negotiation Successfully Sent', id: row.id, round, roundsLeft: MAX_ROUNDS - Math.max(round, 0) };
    }

    async createNegotiations(token: string, body: CreateNegotiationBulk) {
        const ids: string[] = [];
        for (const item of body.items) ids.push((await this.createNegotiation(token, item)).id);
        return { message: 'Negotiations Successfully Sent', ids };
    }

    async getNegotiations(token: string, bid: string) {
        const authId = await this.authId(token);
        const ctx = await this.bidContext(authId, bid);
        const mine = ctx.job.buyerId === authId ? 'buyer' : 'seller';
        const rows = await this.negotiationsRepository.getNegotiations(authId, ctx.id);
        return rows.map((r) => ({
            id: r.id,
            from: r.sender === mine ? 'me' : 'them',
            sender: r.sender,
            text: r.body,
            price: r.offeredPrice === null ? null : Number(r.offeredPrice),
            round: r.round,
            at: r.createdAt.toISOString(),
        }));
    }

    async hireSeller(token: string, body: HireSeller) {
        const authId = await this.authId(token);
        const ctx = await this.bidContext(authId, body.bid_id);
        if (ctx.job.buyerId !== authId) throw new ForbiddenException('Only the buyer can hire');
        if (ctx.seller.ownerId === authId) throw new ForbiddenException('You cannot hire yourself');
        if (!NEGOTIABLE_JOB.includes(ctx.job.status)) throw new BadRequestException('This job already has a seller');
        if (ctx.status === 'held' && !ctx.ownerApprovedRisk) throw new BadRequestException('This offer is held by the fraud and lure check');
        if (!HIREABLE_BID.includes(ctx.status) && ctx.status !== 'held') throw new BadRequestException('This offer can no longer be accepted');
        const price = body.price ?? agreedPriceOf(ctx);
        const row = await this.negotiationsRepository.createOffer({ jobId: ctx.job.id, bidId: ctx.id, sellerId: ctx.seller.id, price });
        if (!row) throw new ConflictException('You already sent a hire offer for this job. Wait for the answer first.');
        return { message: 'Hire Offer Successfully Sent', id: row.id, offerSt: 'wait', price };
    }

    async getOffer(token: string, job: string) {
        const authId = await this.authId(token);
        const row = await this.negotiationsRepository.getJobOffer(authId, this.jobKey(job));
        if (!row) return { offerSt: '' };
        return toOfferView(row);
    }

    /**
     * The seller accepts the buyer's hire offer. On a real chain the contract takes the offer first (accept_offer, signed
     * by the buyer's agents key): if it refuses, nothing changes here and the seller sees why. Then the job is agreed,
     * buyer and seller get their conversation, the buyer is told, and the buyer's agent funds the escrow (fund_job).
     * If funding fails the buyer is told why and can retry it with Protect payment.
     */
    async acceptOffer(token: string, id: string) {
        const authId = await this.authId(token);
        const offer = await this.sellerOffer(authId, id);
        if (!NEGOTIABLE_JOB.includes(offer.job.status)) throw new BadRequestException('This job already has a seller');
        let agents: string;
        let acceptTx: string;
        try {
            agents = await this.buyerAgents(offer);
            acceptTx = await this.chainAccept(offer, agents);
        } catch (e) {
            throw new BadRequestException(`NEAR did not take the hire offer, so nothing changed: ${e instanceof Error ? e.message : 'accept_offer failed'}`);
        }
        const count = await this.negotiationsRepository.acceptOffer(authId, offer);
        if (count === 0) throw new ConflictException('This hire offer was already answered');
        const price = `${Number(offer.price).toFixed(2)} USDC`;
        await this.negotiationsRepository.openHireThread(offer).catch(() => null);
        await this.negotiationsRepository.notify(offer.job.buyerId, `${offer.seller.displayName} accepted your hire offer on ${offer.job.ref}`, `${price}. Your agent is protecting the payment now.`, `/job?id=${offer.job.ref}`).catch(() => null);
        const funding = await this.chainFund(offer, agents);
        if (!funding.funded) {
            await this.negotiationsRepository.notify(offer.job.buyerId, `Protect the payment for ${offer.job.ref}`, `Your agent could not fund ${price}: ${funding.fundError}. Open the job and press Protect payment to try again.`, `/job?id=${offer.job.ref}`).catch(() => null);
        }
        return { message: 'Hire Offer Successfully Accepted', id, offerSt: 'accepted', accepted: true, acceptTx, acceptError: null, ...funding };
    }

    /**
     * Protect payment, by the buyer: funds an agreed job whose funding failed when the seller accepted.
     * Runs accept_offer first if the contract does not have the offer yet.
     */
    async fundAgreed(token: string, ref: string) {
        const authId = await this.authId(token);
        if (!/^J-\d+$/.test(ref ?? '')) throw new BadRequestException('Job id is not valid');
        const offer = await this.negotiationsRepository.getAcceptedOffer(authId, ref);
        if (!offer) throw new NotFoundException('No accepted hire offer on this job');
        if (offer.job.status !== 'agreed') throw new BadRequestException(offer.job.status === 'funded' ? 'The payment is already protected' : 'This job is not waiting for payment');
        const agents = await this.buyerAgents(offer);
        if (!this.chainService.isMock()) {
            const onChain = await this.chainService.view<{ stage?: string } | null>('get_job', { job_id: chainJobId(offer.job) }).catch(() => null);
            if (!onChain) throw new BadRequestException(`${ref} is not on NEAR, so it cannot be funded`);
            if (onChain.stage === 'Open') {
                try { await this.chainAccept(offer, agents); } catch (e) { throw new BadRequestException(`accept_offer failed: ${e instanceof Error ? e.message : 'unknown error'}`); }
            }
        }
        const funding = await this.chainFund(offer, agents);
        if (!funding.funded) throw new BadRequestException(`Funding failed: ${funding.fundError}`);
        return { message: 'Payment protected', ref, fundTx: funding.fundTx };
    }

    /** accept_offer on the contract, signed by the buyer's agents key. Throws with the contract's reason. */
    private async chainAccept(offer: OfferRow, agents: string): Promise<string> {
        const terms = await this.negotiationsRepository.getAcceptTerms(offer.jobId, offer.bidId);
        if (!terms.bid) throw new BadRequestException('The hire offer has no bid');
        if (terms.bid.onchainId === null && !this.chainService.isMock()) {
            throw new BadRequestException('This offer never reached NEAR, so it cannot be accepted. The seller should withdraw it and bid again');
        }
        if (!terms.spec?.specHash) throw new BadRequestException('The job has no locked spec');
        const tx = await this.chainService.callAs('transaction_agent', agents, 'accept_offer', {
            job_id: chainJobId(offer.job),
            bid_id: chainBidId(terms.bid),
            price: usdcUnits(offer.price),
            spec_hash: terms.spec.specHash,
            holdout_hash: terms.spec.holdoutHash || NO_HOLDOUT,
            attempts: ACCEPT_ATTEMPTS,
            deadline: deadlineIn((terms.bid.deliveryDays ?? 7) + ACCEPT_GRACE_DAYS),
        });
        return tx.tx_hash;
    }

    /** fund_job, signed by the buyer's agents key. Never throws: the result says whether the escrow is funded. */
    private async chainFund(offer: OfferRow, agents: string): Promise<Pick<ChainAccept, 'funded' | 'fundTx' | 'fundError'>> {
        try {
            const tx = await this.chainService.callAs('transaction_agent', agents, 'fund_job', { job_id: chainJobId(offer.job) });
            return { funded: true, fundTx: tx.tx_hash, fundError: null };
        } catch (e) {
            return { funded: false, fundTx: null, fundError: e instanceof Error ? e.message : 'Funding failed' };
        }
    }

    private async buyerAgents(offer: OfferRow): Promise<string> {
        if (offer.job.buyer.agentsAccountId) return offer.job.buyer.agentsAccountId;
        const created = await this.chainService.createAccount(offer.job.buyerId);
        await this.negotiationsRepository.setBuyerAccounts(offer.job.buyerId, offer.job.buyer.nearAccountId ?? created.account_id, created.agents_account_id);
        return created.agents_account_id;
    }

    async declineOffer(token: string, id: string) {
        const authId = await this.authId(token);
        await this.sellerOffer(authId, id);
        const count = await this.negotiationsRepository.declineOffer(authId, id);
        if (count === 0) throw new ConflictException('This hire offer was already answered');
        return { message: 'Hire Offer Successfully Declined', id, offerSt: 'declined' };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job ?? '')) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }

    private async bidContext(authId: string, bidId: string): Promise<BidContext> {
        if (!isUUID(bidId)) throw new BadRequestException('Bid id must be a valid id');
        const ctx = await this.negotiationsRepository.getBidContext(authId, bidId);
        if (!ctx) throw new NotFoundException('Offer not found');
        return ctx;
    }

    private async sellerOffer(authId: string, id: string): Promise<OfferRow> {
        if (!isUUID(id)) throw new BadRequestException('Hire offer id must be a valid id');
        const offer = await this.negotiationsRepository.getOffer(authId, id);
        if (!offer) throw new NotFoundException('Hire offer not found');
        if (offer.seller.ownerId !== authId) throw new ForbiddenException('Only the seller can answer a hire offer');
        if (offer.status !== 'sent') throw new ConflictException('This hire offer was already answered');
        return offer;
    }
}
