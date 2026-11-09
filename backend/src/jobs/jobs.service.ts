import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { chainIdOf, ChainService, deadlineIn, usdcUnits } from '../chain/chain.service.js';
import { PublishJob } from './dto/PublishJob.dto.js';
import { JobKey, JobRow, JobsRepository, OpenJobRow } from './jobs.repository.js';

export const POST_DEADLINE_DAYS = 30;

type Pill = [string, string];

interface StageInfo {
    stage: string;
    at: number;
    grp: string;
    status: Pill;
}

export const STAGES: Record<string, StageInfo> = {
    draft: { stage: 'Requested', at: 0, grp: 'offers', status: ['', 'Writing the spec'] },
    open: { stage: 'Offers', at: 1, grp: 'offers', status: ['info', 'Getting offers'] },
    negotiating: { stage: 'Offers', at: 1, grp: 'offers', status: ['info', 'Negotiating'] },
    agreed: { stage: 'Agreed', at: 2, grp: 'waiting', status: ['', 'Waiting on seller'] },
    funded: { stage: 'Protected', at: 4, grp: 'working', status: ['acc', 'Payment protected'] },
    in_progress: { stage: 'Protected', at: 4, grp: 'working', status: ['acc', 'Payment protected'] },
    delivered: { stage: 'Delivered', at: 4, grp: 'working', status: ['hold', 'Reviewers voting'] },
    reviewed: { stage: 'Reviewed', at: 5, grp: 'working', status: ['hold', 'Reviewed'] },
    released: { stage: 'Released', at: 6, grp: 'done', status: ['ok', 'Paid'] },
    settled: { stage: 'Settled', at: 7, grp: 'done', status: ['ok', 'Paid'] },
    disputed: { stage: 'Disputed', at: 5, grp: 'disputed', status: ['block', 'Disputed'] },
    refunded: { stage: 'Refunded', at: 7, grp: 'done', status: ['', 'Refunded'] },
    expired: { stage: 'Expired', at: 7, grp: 'done', status: ['', 'Expired'] },
    cancelled: { stage: 'Cancelled', at: 0, grp: 'done', status: ['', 'Cancelled'] },
};

export const budgetHintOf = (job: { budgetMaxPublic: { toString(): string } | null; budgetLabel: string | null }): string => {
    if (job.budgetMaxPublic !== null) return usdcUnits(job.budgetMaxPublic);
    const numbers = (job.budgetLabel ?? '').match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    return numbers.length > 0 ? usdcUnits(Math.max(...numbers)) : '0';
};

export interface PostResult {
    posted: boolean;
    onchainId: string | null;
    postTx: string | null;
    postError: string | null;
}

const stageOf = (status: string): StageInfo => STAGES[status] ?? STAGES['draft']!;

export const ago = (date: Date | null, now = new Date()): string => {
    if (!date) return '';
    const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
};

const budgetOf = (row: JobRow): string =>
    row.agreedPrice !== null ? Number(row.agreedPrice).toFixed(2) : (row.budgetLabel ?? '');

const noteOf = (row: JobRow): string | undefined => {
    if (row.status === 'draft') return 'Your spec writer is turning the request into tests.';
    if (row.status === 'open' || row.status === 'negotiating') {
        const n = row._count.bids;
        return n === 0 ? 'No offers yet.' : `${n} offer${n === 1 ? '' : 's'} so far.`;
    }
    return undefined;
};

export const toOtherJob = (row: JobRow) => {
    const info = stageOf(row.status);
    return {
        id: row.ref,
        title: row.title,
        cat: row.categoryRef.name,
        budget: budgetOf(row),
        status: info.status,
        who: row.seller?.displayName ?? '',
        note: noteOf(row),
        at: info.at,
        grp: info.grp,
        posted: row.visibility === 'public' && row.status !== 'draft',
        href: `/job?id=${row.ref}`,
    };
};

export const toJob = (row: JobRow) => {
    const info = stageOf(row.status);
    const spec = row.acceptanceSpecs[0];
    return {
        id: row.ref,
        uuid: row.id,
        title: row.title,
        repo: (row.repoUrl ?? '').replace(/^https?:\/\//, ''),
        base: row.baseCommit ?? '',
        cat: row.categoryRef.name,
        plain: row.description,
        posted: ago(row.postedAt ?? row.createdAt),
        specHash: spec?.specHash ?? '',
        specLocked: Boolean(spec?.lockedAt),
        budget: budgetOf(row),
        stage: info.stage,
        at: info.at,
        status: info.status,
        visibility: row.visibility,
        seller: row.seller?.displayName ?? '',
        offers: row._count.bids,
    };
};

const blurbOf = (text: string): string => (text.length > 180 ? `${text.slice(0, 177).replace(/\s+\S*$/, '')}...` : text);

export const toOpenJob = (row: OpenJobRow, now = new Date()) => {
    const tests = row.acceptanceSpecs[0]?.failingTests.length ?? 0;
    return {
        id: row.ref,
        title: row.title,
        cats: row.categoryRef.name,
        category: row.categoryRef.slug,
        budget: row.budgetLabel ?? '',
        check: tests > 0 ? `${tests} failing test${tests === 1 ? '' : 's'}` : 'Locked tests',
        bids: row._count.bids,
        buyer: row.buyer.displayName ?? 'Buyer',
        blurb: blurbOf(row.description),
        buyerRating: 'New buyer',
        minutesAgo: Math.max(0, Math.round((now.getTime() - (row.postedAt ?? row.createdAt).getTime()) / 60000)),
    };
};

@Injectable()
export class JobsService {
    constructor(
        private readonly jobsRepository: JobsRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
    ) {}

    async getJobs(token: string, grp?: string) {
        const authId = await this.authId(token);
        const rows = await this.jobsRepository.getJobs(authId);
        const jobs = rows.map(toOtherJob);
        return grp && grp !== 'all' ? jobs.filter((j) => j.grp === grp) : jobs;
    }

    async getJob(token: string, id: string) {
        const authId = await this.authId(token);
        const row = await this.jobsRepository.getJob(authId, this.jobKey(id));
        if (!row) throw new NotFoundException('Job not found');
        return toJob(row);
    }

    async publishJob(token: string, body: PublishJob) {
        const authId = await this.authId(token);
        const row = await this.jobsRepository.getOwnedJob(authId, this.jobKey(body.id));
        if (!row) throw new NotFoundException('Job not found');
        if (!['draft', 'open'].includes(row.status)) throw new BadRequestException('This job is already past the offers stage');
        if (!row.acceptanceSpecs[0]?.lockedAt) throw new BadRequestException('Lock the spec before posting the job');
        const count = await this.jobsRepository.publishJob(authId, row.id);
        if (count === 0) throw new BadRequestException('This job is already past the offers stage');
        const chain = await this.postJob(authId, row.id);
        return { message: 'Job Successfully Published', id: row.id, ref: row.ref, ...chain };
    }

    private async postJob(authId: string, id: string): Promise<PostResult> {
        try {
            const job = await this.jobsRepository.getPostContext(authId, id);
            if (!job) throw new NotFoundException('Job not found');
            if (job.onchainId !== null) return { posted: true, onchainId: job.onchainId.toString(), postTx: job.postedTx, postError: null };
            const specHash = job.acceptanceSpecs[0]?.specHash;
            if (!specHash) throw new BadRequestException('The locked spec has no hash');
            let agents = job.buyer.agentsAccountId;
            if (!agents) {
                const created = await this.chainService.createAccount(authId);
                agents = created.agents_account_id;
                await this.jobsRepository.setBuyerAccounts(authId, job.buyer.nearAccountId ?? created.account_id, agents);
            }
            const tx = await this.chainService.callAs('transaction_agent', agents, 'post_job', {
                category: job.category, budget_hint: budgetHintOf(job), spec_hash: specHash, deadline: deadlineIn(POST_DEADLINE_DAYS),
            });
            const onchainId = chainIdOf(tx.result);
            if (onchainId === null) throw new BadRequestException('post_job returned no job id');
            await this.jobsRepository.setOnchainJob(authId, id, onchainId, tx.tx_hash);
            return { posted: true, onchainId: onchainId.toString(), postTx: tx.tx_hash, postError: null };
        } catch (e) {
            return { posted: false, onchainId: null, postTx: null, postError: e instanceof Error ? e.message : 'Posting the job on chain failed' };
        }
    }

    async getOpenJobs(category?: string, q?: string) {
        if (category && !['rust', 'fe', 'tests', 'scripts'].includes(category)) throw new BadRequestException('Invalid category');
        const rows = await this.jobsRepository.getOpenJobs({ category: category || undefined, q: q?.trim().slice(0, 100) || undefined });
        return rows.map((r) => toOpenJob(r));
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
