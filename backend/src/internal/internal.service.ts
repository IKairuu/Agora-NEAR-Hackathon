import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InternalRepository, NotificationInput } from './internal.repository.js';

export const agentNotifySchema = z.object({
    runId: z.string().max(100).nullish(),
    role: z.string().min(1).max(40),
    ok: z.boolean(),
    jobId: z.string().uuid().nullish(),
    result: z.record(z.string(), z.unknown()).nullish(),
    error: z.string().max(2000).nullish(),
});

export type AgentNotify = z.infer<typeof agentNotifySchema>;

export const decideBid = (bid: { status: string; priceCheck: string | null; fraudScore: number | null; holdReason: string | null }): { status: 'live' | 'held'; reason: string | null } | null => {
    if (!['pending_check', 'live'].includes(bid.status)) return null;
    if (bid.priceCheck === 'held') return { status: 'held', reason: bid.holdReason ?? 'Price far from the usual range' };
    if (bid.fraudScore !== null && bid.fraudScore >= 70) return { status: 'held', reason: bid.holdReason ?? 'High fraud and lure risk' };
    if (bid.fraudScore !== null && bid.fraudScore >= 40) return { status: 'held', reason: bid.holdReason ?? 'Needs your OK: medium risk' };
    if (bid.status === 'pending_check' && bid.fraudScore !== null && bid.priceCheck !== null) return { status: 'live', reason: null };
    return null;
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

@Injectable()
export class InternalService {
    constructor(private readonly internalRepository: InternalRepository) {}

    async agentNotify(raw: unknown) {
        const parsed = agentNotifySchema.safeParse(raw);
        if (!parsed.success) throw new BadRequestException(`Invalid agent result: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
        const body = parsed.data;
        const result = body.result ?? {};
        const actions: string[] = [];
        const notes: NotificationInput[] = [];
        const job = body.jobId ? await this.internalRepository.getJob(body.jobId) : null;

        if (body.role === 'price_check' || body.role === 'fraud_lure') {
            const bidId = text(result['bidId']) ?? (result['subjectType'] === 'bid' ? text(result['subjectId']) : null);
            const bid = bidId ? await this.internalRepository.getBid(bidId) : null;
            const decision = bid ? decideBid(bid) : null;
            if (bid && decision && decision.status !== bid.status) {
                const count = await this.internalRepository.setBidStatus(bid.id, bid.status, decision.status, decision.reason);
                if (count > 0) {
                    actions.push(`bid ${decision.status}`);
                    const price = Number(bid.price).toFixed(2);
                    notes.push(decision.status === 'live'
                        ? { userId: bid.job.buyerId, kind: 'offer', title: `New offer on ${bid.job.ref}`, body: `${bid.seller.displayName} offered ${price} USDC`, link: `/job?id=${bid.job.ref}` }
                        : { userId: bid.job.buyerId, kind: 'held', title: `Held an offer on ${bid.job.ref}`, body: `${bid.seller.displayName}: ${decision.reason}`, link: `/job?id=${bid.job.ref}` });
                    if (decision.status === 'held') {
                        notes.push({ userId: bid.seller.ownerId, kind: 'held', title: `Your offer on ${bid.job.ref} is held`, body: `${decision.reason}. You can explain why it is fair.`, link: '/orders' });
                    }
                }
            }
        } else if (body.role === 'spec_writer' && job) {
            const weak = result['failsOnBase'] === false;
            notes.push({ userId: job.buyerId, kind: 'spec', title: weak ? `Draft spec for ${job.ref} needs your review` : `Draft spec ready for ${job.ref}`, body: job.title, link: `/job?id=${job.ref}` });
        } else if (body.role === 'reviewer' && job) {
            const verdict = result['approve'] === true ? 'approved' : 'rejected';
            const reviewer = typeof result['reviewer'] === 'number' || typeof result['reviewer'] === 'string' ? `Reviewer ${result['reviewer']}` : 'A reviewer';
            const title = `${reviewer} ${verdict} the delivery on ${job.ref}`;
            notes.push({ userId: job.buyerId, kind: 'review', title, body: null, link: `/job?id=${job.ref}` });
            if (job.seller?.ownerId) notes.push({ userId: job.seller.ownerId, kind: 'review', title, body: null, link: '/orders' });
        } else if (!body.ok && job) {
            notes.push({ userId: job.buyerId, kind: 'agent', title: `Your ${body.role.replace(/_/g, ' ')} agent hit a problem on ${job.ref}`, body: body.error ?? null, link: `/job?id=${job.ref}` });
        }

        const notified = await this.internalRepository.createNotifications(notes);
        if (notified > 0) actions.push(`notified ${notified}`);
        return { message: 'Agent Result Successfully Received', role: body.role, actions };
    }
}
