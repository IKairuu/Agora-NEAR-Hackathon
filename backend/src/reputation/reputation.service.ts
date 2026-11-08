import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { ChainService } from '../chain/chain.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateRating } from './dto/CreateRating.dto.js';
import { JobKey, ReputationRepository } from './reputation.repository.js';

const ACCOUNT = /^[a-z0-9._-]{2,64}$/;
const PAID = ['released', 'settled'];

type RatingRow = Awaited<ReturnType<ReputationRepository['getRatings']>>[number];

const toRating = (r: RatingRow) => ({ stars: r.stars, comment: r.comment, job: r.job.ref, title: r.job.title, ratingTx: r.ratingTx, at: r.createdAt });

@Injectable()
export class ReputationService {
    constructor(
        private readonly reputationRepository: ReputationRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
    ) {}

    async getReputation(account: string) {
        const accountId = this.account(account);
        const { rep, records, stats, ratings } = await this.reputationRepository.getReputation(accountId);
        const settled = rep?.settledJobs ?? 0;
        const pass = rep?.firstTryPassRate === null || rep?.firstTryPassRate === undefined ? null : Number(rep.firstTryPassRate);
        return {
            account: accountId,
            settled,
            refunded: rep?.refundedJobs ?? 0,
            disputes: rep?.disputedJobs ?? 0,
            volume: rep ? Number(rep.settledVolume) : 0,
            buyers: rep?.distinctBuyers ?? 0,
            pass: pass === null ? '—' : `${Math.round(pass)}%`,
            passRate: pass,
            newSeller: settled < 3,
            records: records.map((r) => ({
                tokenId: r.tokenId, job: r.job.ref, title: r.job.title, amount: Number(r.amount), mintTx: r.mintTx,
                explorer: r.mintTx ? this.chainService.explorerTxUrl(r.mintTx) : null, at: r.mintedAt,
            })),
            rating: stats._count._all ? Math.round((stats._avg.stars ?? 0) * 10) / 10 : null,
            ratings: stats._count._all,
            recent: ratings.map(toRating),
            syncedAt: rep?.syncedAt ?? null,
        };
    }

    async getRatings(account: string) {
        const rows = await this.reputationRepository.getRatings(this.account(account));
        return { items: rows.map(toRating) };
    }

    async createRating(token: string, body: CreateRating) {
        const authId = await this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
        const job = await this.reputationRepository.getRatingTarget(authId, this.jobKey(body.job_id));
        if (!job) throw new NotFoundException('Job not found');
        if (!PAID.includes(job.status)) throw new BadRequestException('You can rate once the job is paid');
        if (job.ratings.length) throw new ConflictException('You already rated this job');
        if (!job.seller) throw new BadRequestException('This job has no seller');
        const asBuyer = job.buyerId === authId;
        const rater = asBuyer ? job.buyer.nearAccountId : job.seller.nearAccountId;
        const ratee = asBuyer ? job.seller.nearAccountId : job.buyer.nearAccountId;
        if (!rater || !ratee) throw new BadRequestException('Both sides need a NEAR account to rate');
        const tx = await this.chainService.callAs('owner', rater, 'rate', { job_id: job.ref, stars: body.stars });
        try {
            const row = await this.reputationRepository.createRating({
                jobId: job.id, raterId: authId, rateeAccount: ratee, rateeUserId: asBuyer ? job.seller.ownerId : job.buyerId,
                stars: body.stars, comment: body.comment?.trim() || null, ratingTx: tx.tx_hash, ref: job.ref,
            });
            return { message: 'Rating Successfully Saved', id: row.id, stars: body.stars, ratee, ratingTx: tx.tx_hash };
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You already rated this job');
            throw e;
        }
    }

    private account(account: string): string {
        const a = (account ?? '').toLowerCase();
        if (!ACCOUNT.test(a)) throw new BadRequestException('Account is not a valid NEAR account');
        return a;
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job ?? '')) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }
}
