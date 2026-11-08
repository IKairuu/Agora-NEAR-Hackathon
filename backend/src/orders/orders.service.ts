import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { JobBrief, JobKey, OrdersRepository } from './orders.repository.js';

const usd = (n: unknown) => Number(n).toFixed(2);

const WON_STAGE: Record<string, [number, string]> = {
    agreed: [1, 'Hired. Waiting for the buyer to protect the payment.'],
    funded: [2, 'Tests locked, escrow funded. You can start.'],
    in_progress: [2, 'Tests locked, escrow funded.'],
    delivered: [3, 'Delivered. Reviewers are running the locked tests.'],
    reviewed: [3, 'Reviewed. Waiting for the release.'],
    disputed: [3, 'In dispute. The payment is frozen until it is resolved.'],
    released: [4, 'Released after 2 of 3 approvals.'],
    settled: [4, 'Paid and settled.'],
    refunded: [4, 'Refunded to the buyer.'],
    expired: [4, 'Expired. Unreleased money went back to the buyer.'],
};

export interface Order {
    id: string;
    buyer: string;
    title: string;
    cat: string;
    price: string;
    st: number;
    note: string;
    bidId?: string;
    hireOfferId?: string;
}

const base = (job: JobBrief) => ({ id: job.ref, buyer: job.buyer.displayName ?? 'Buyer', title: job.title, cat: job.categoryRef.name });

@Injectable()
export class OrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly authService: AuthService,
    ) {}

    async getOrders(token: string) {
        const authId = await this.authId(token);
        const sellerIds = await this.ordersRepository.getMySellerIds(authId);
        if (sellerIds.length === 0) return [];
        const serviceIds = await this.ordersRepository.getMyServiceIds(sellerIds);
        const [won, offers, bids, direct] = await Promise.all([
            this.ordersRepository.getWonJobs(sellerIds),
            this.ordersRepository.getHireOffers(sellerIds),
            this.ordersRepository.getMyBids(sellerIds),
            this.ordersRepository.getDirectRequests(serviceIds, sellerIds),
        ]);
        const orders = new Map<string, Order>();
        const add = (order: Order) => {
            if (!orders.has(order.id)) orders.set(order.id, order);
        };
        for (const job of won) {
            const [st, note] = WON_STAGE[job.status] ?? [1, ''];
            add({ ...base(job), price: job.agreedPrice !== null ? usd(job.agreedPrice) : (job.budgetLabel ?? ''), st, note });
        }
        for (const offer of offers) {
            add({ ...base(offer.job), price: usd(offer.price), st: 0, note: `Hire offer: ${usd(offer.price)} USDC. Accept to start, or decline.`, hireOfferId: offer.id });
        }
        for (const bid of bids) {
            const days = bid.deliveryDays ? ` in ${bid.deliveryDays} day${bid.deliveryDays === 1 ? '' : 's'}` : '';
            const note = bid.status === 'held' ? 'Your offer is held for review. Explain why it is fair.' : `Your offer: ${usd(bid.price)} USDC${days}. Waiting for the buyer.`;
            add({ ...base(bid.job), price: usd(bid.price), st: 1, note, bidId: bid.id });
        }
        for (const job of direct) {
            add({ ...base(job), price: job.budgetLabel ?? '', st: 0, note: 'Direct request from your service page. Answer with an offer or decline.' });
        }
        return [...orders.values()];
    }

    async declineRequest(token: string, id: string) {
        const authId = await this.authId(token);
        const sellerIds = await this.ordersRepository.getMySellerIds(authId);
        const serviceIds = await this.ordersRepository.getMyServiceIds(sellerIds);
        const row = await this.ordersRepository.declineRequest(serviceIds, this.jobKey(id));
        if (!row) throw new NotFoundException('Direct request not found');
        return { message: 'Request Successfully Declined', id: row.id, ref: row.ref };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job ?? '')) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }
}
