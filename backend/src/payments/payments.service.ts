import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { ChainService } from '../chain/chain.service.js';
import { BASE_ATTEMPTS, deadlineOf, refundRefusal } from '../indexer/indexer.service.js';
import { IndexerRepository } from '../indexer/indexer.repository.js';
import { JobAction } from './dto/JobAction.dto.js';
import { JobKey, PaymentsRepository } from './payments.repository.js';

type Action = { allowed: boolean; why: string | null };

@Injectable()
export class PaymentsService {
    constructor(
        private readonly paymentsRepository: PaymentsRepository,
        private readonly indexerRepository: IndexerRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
    ) {}

    async getPayment(token: string, job: string) {
        const userId = await this.authId(token);
        const row = await this.paymentsRepository.getPaymentJob(userId, this.jobKey(job));
        if (!row) throw new NotFoundException('Job not found');
        const ctx = await this.indexerRepository.getRefundContext({ id: row.id });
        if (!ctx) throw new NotFoundException('Job not found');
        const isBuyer = row.buyerId === userId;
        const buyerSigner = ctx.buyerAccount ?? '';
        const check = (method: string, buyerOnly: boolean): Action => {
            if (buyerOnly && !isBuyer) return { allowed: false, why: 'Only the buyer can do this' };
            const why = refundRefusal({ signer: buyerSigner, method }, ctx, Date.now());
            return { allowed: why === null, why };
        };
        const milestone = row.milestones[0] ?? null;
        const attemptsLeft = Math.max(0, BASE_ATTEMPTS + ctx.extraAttempts - ctx.lastAttempt);
        return {
            job: row.ref,
            status: row.status,
            amount: milestone ? Number(milestone.amount) : row.agreedPrice === null ? null : Number(row.agreedPrice),
            protected: ['funded', 'in_progress', 'delivered', 'reviewed', 'disputed'].includes(row.status),
            deadline: deadlineOf(ctx),
            attempt: ctx.lastAttempt,
            attemptsLeft,
            extraAttempts: ctx.extraAttempts,
            actions: {
                refund: check('refund_milestone', true),
                extra_attempt: check('grant_attempt', true),
                refund_expired: check('refund_expired', false),
            },
        };
    }

    async refund(token: string, body: JobAction) {
        const { row } = await this.buyerJob(token, body);
        const tx = await this.chainService.callAs('owner', row.buyer.nearAccountId ?? '', 'refund_milestone', { job_id: this.chainId(row) });
        return { message: 'Payment Successfully Refunded', job: row.ref, tx_hash: tx.tx_hash, explorer_url: tx.explorer_url };
    }

    async grantAttempt(token: string, body: JobAction) {
        const { row } = await this.buyerJob(token, body);
        const tx = await this.chainService.callAs('owner', row.buyer.nearAccountId ?? '', 'grant_attempt', { job_id: this.chainId(row) });
        return { message: 'Extra Attempt Successfully Granted', job: row.ref, tx_hash: tx.tx_hash, explorer_url: tx.explorer_url };
    }

    async refundExpired(token: string, body: JobAction) {
        const userId = await this.authId(token);
        const row = await this.paymentsRepository.getPaymentJob(userId, this.jobKey(body.job_id));
        if (!row) throw new NotFoundException('Job not found');
        const platform = process.env['AGORA_PLATFORM_ACCOUNT'] ?? 'agora-testnet.testnet';
        const tx = await this.chainService.callAs('platform', platform, 'refund_expired', { job_id: this.chainId(row) });
        return { message: 'Payment Successfully Refunded', job: row.ref, tx_hash: tx.tx_hash, explorer_url: tx.explorer_url };
    }

    private async buyerJob(token: string, body: JobAction) {
        const userId = await this.authId(token);
        const row = await this.paymentsRepository.getPaymentJob(userId, this.jobKey(body.job_id));
        if (!row) throw new NotFoundException('Job not found');
        if (row.buyerId !== userId) throw new BadRequestException('Only the buyer can do this');
        if (!row.buyer.nearAccountId) throw new BadRequestException('The buyer has no NEAR account yet');
        return { userId, row };
    }

    private chainId(row: { onchainId: bigint | null; ref: string }): string {
        return row.onchainId?.toString() ?? row.ref;
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
