import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AgentsService } from '../agents/agents.service.js';
import { AuthService } from '../auth/auth.service.js';
import { sealLimit } from '../limits.js';
import { CreateRequest } from './dto/CreateRequest.dto.js';
import { CreateRequestBulk } from './dto/CreateRequestBulk.dto.js';
import { EditRequest } from './dto/EditRequest.dto.js';
import { NewJob, RequestsRepository } from './requests.repository.js';

export { openLimit, sealLimit } from '../limits.js';

const CATEGORY_BY_LABEL: Record<string, string> = {
    'smart contracts': 'rust',
    'front-end': 'fe',
    tests: 'tests',
    scripts: 'scripts',
};

export const guessCategory = (text: string): string => {
    const t = text.toLowerCase();
    if (/\b(react|front-?end|css|safari|browser|modal|layout|ui)\b/.test(t)) return 'fe';
    if (/\b(script|csv|export|cron|batch)\b/.test(t)) return 'scripts';
    if (/\b(coverage|playwright|write (unit |property )?tests)\b/.test(t)) return 'tests';
    return 'rust';
};

export const titleOf = (text: string): string => {
    const first = text.trim().split(/(?<=[.!?])\s/)[0] ?? text.trim();
    if (first.length <= 80) return first;
    const cut = first.slice(0, 78);
    const space = cut.lastIndexOf(' ');
    return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}...`;
};

@Injectable()
export class RequestsService {
    constructor(
        private readonly requestsRepository: RequestsRepository,
        private readonly authService: AuthService,
        private readonly agentsService: AgentsService,
    ) {}

    async createRequest(token: string, body: CreateRequest) {
        const authId = await this.authId(token);
        const job = await this.toNewJob(body);
        const [row] = await this.requestsRepository.createRequests(authId, [job]);
        const agent = job.repoUrl ? await this.agentsService.dispatch('spec_writer', { ownerId: authId, jobId: row!.id, payload: { jobId: row!.id } }) : null;
        return { message: 'Request Successfully Created', id: row!.id, ref: row!.ref, specWriter: agent?.status ?? 'waiting_for_repo' };
    }

    async createRequests(token: string, body: CreateRequestBulk) {
        const authId = await this.authId(token);
        const jobs: NewJob[] = [];
        for (const item of body.items) jobs.push(await this.toNewJob(item));
        const rows = await this.requestsRepository.createRequests(authId, jobs);
        return { message: 'Requests Successfully Created', ids: rows.map((r) => r.id), refs: rows.map((r) => r.ref) };
    }

    async editRequest(token: string, body: EditRequest) {
        const authId = await this.authId(token);
        const job = await this.requestsRepository.getOwnedJob(authId, body.id);
        if (!job) throw new NotFoundException('Request not found');
        if (!['draft', 'open'].includes(job.status)) throw new BadRequestException('The request cannot change after the job is agreed');
        const count = await this.requestsRepository.editRequest(authId, body.id, {
            title: body.title,
            description: body.text,
            category: body.category,
            repoUrl: body.repo_url,
            baseCommit: body.base_commit,
            budgetLabel: body.budget_label,
            limit: body.budget_max ? sealLimit(body.budget_max) : null,
        });
        if (count === 0) throw new BadRequestException('The request cannot change after the job is agreed');
        if (body.repo_url || body.base_commit) await this.agentsService.dispatch('spec_writer', { ownerId: authId, jobId: job.id, payload: { jobId: job.id } });
        return { message: 'Request Successfully Edited', id: job.id, ref: job.ref };
    }

    async keepWaiting(token: string, id: string) {
        const authId = await this.authId(token);
        if (!isUUID(id)) throw new BadRequestException('Request id must be a valid id');
        const count = await this.requestsRepository.keepWaiting(authId, id);
        if (count === 0) throw new NotFoundException('Request not found');
        return { message: 'Your agent keeps the job private and checks again in 30 minutes', id };
    }

    async cancelRequest(token: string, id: string) {
        const authId = await this.authId(token);
        if (!isUUID(id)) throw new BadRequestException('Request id must be a valid id');
        const job = await this.requestsRepository.getOwnedJob(authId, id);
        if (!job) throw new NotFoundException('Request not found');
        if (!['draft', 'open'].includes(job.status)) throw new BadRequestException('A request can only be discarded before anyone is hired');
        const count = await this.requestsRepository.cancelRequest(authId, id);
        if (count === 0) throw new BadRequestException('A request can only be discarded before anyone is hired');
        return { message: 'Request Successfully Discarded', id: job.id, ref: job.ref };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private async toNewJob(body: CreateRequest): Promise<NewJob> {
        let category = body.category ?? guessCategory(body.text);
        let visibility = 'private';
        if (body.service_id) {
            const service = await this.requestsRepository.getService(body.service_id);
            if (!service) throw new NotFoundException('This service is not available');
            category = body.category ?? CATEGORY_BY_LABEL[service.category.toLowerCase()] ?? service.category;
            visibility = 'direct';
        }
        return {
            title: body.title ?? titleOf(body.text),
            description: body.text.trim(),
            category,
            repoUrl: body.repo_url ?? null,
            baseCommit: body.base_commit ?? null,
            budgetLabel: body.budget_label ?? null,
            serviceId: body.service_id ?? null,
            visibility,
            limit: body.budget_max ? sealLimit(body.budget_max) : null,
        };
    }
}
