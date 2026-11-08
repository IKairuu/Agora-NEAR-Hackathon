import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { PublishJob } from './dto/PublishJob.dto.js';
import { JobKey, JobRow, JobsRepository } from './jobs.repository.js';

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

@Injectable()
export class JobsService {
    constructor(
        private readonly jobsRepository: JobsRepository,
        private readonly authService: AuthService,
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
        return { message: 'Job Successfully Published', id: row.id, ref: row.ref };
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
