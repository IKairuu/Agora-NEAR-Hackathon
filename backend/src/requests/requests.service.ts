import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AgentsService, type ChatAgentReply } from '../agents/agents.service.js';
import { AuthService } from '../auth/auth.service.js';
import { sealLimit } from '../limits.js';
import { CreateRequest } from './dto/CreateRequest.dto.js';
import { CreateRequestBulk } from './dto/CreateRequestBulk.dto.js';
import { ChatRequest } from './dto/ChatRequest.dto.js';
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

type Turn = { role: 'user' | 'agent'; text: string };

const REPO_RE = /https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i;
/** The first GitHub repository link in a text, without .git or trailing punctuation. */
export const repoIn = (text: string): string | null => {
    const m = text.match(REPO_RE);
    return m ? m[0].replace(/[.,;:)]+$/, '').replace(/\.git$/i, '') : null;
};
const GREETING = /^(hi|hii+|hello|hey|heya|yo|hola|sup|good (morning|afternoon|evening)|thanks|thank you|ty|ok|okay|cool|nice)\b[\s!.?,a-z]{0,12}$/i;
const withoutLinks = (t: string) => t.replace(new RegExp(REPO_RE.source, 'gi'), '').replace(/\s+/g, ' ').trim();
/** What the user asked for, from their own messages: everything but greetings, questions and bare links. */
export const taskIn = (turns: Turn[]): string =>
    turns.filter((m) => m.role === 'user').map((m) => withoutLinks(m.text))
        .filter((t) => t.length >= 15 && !GREETING.test(t) && !(t.length < 40 && /\?$/.test(t))).join('\n\n');

/** Answers on its own when the chat agent in n8n is not reachable: greets, asks for what is missing, or says ready. */
export const fallbackChat = (turns: Turn[]): ChatAgentReply => {
    const user = turns.filter((m) => m.role === 'user').map((m) => m.text.trim());
    const last = user[user.length - 1] ?? '';
    const repo = [...user].reverse().map(repoIn).find(Boolean) ?? '';
    const task = taskIn(turns);
    const none = { title: '', description: '', repo_url: repo };
    if (task && repo) return { ...none, ready: true, reply: 'Thanks, I have what I need.', description: task };
    if (task) return { ...none, ready: false, reply: 'Got it. Which GitHub repository is this for? Paste the link, like https://github.com/owner/repo.' };
    if (repo) return { ...none, ready: false, reply: 'Thanks, I have the repository. What should be changed or fixed there, and how will we know it is done?' };
    if (GREETING.test(last)) return { ...none, ready: false, reply: "Hi! I'm your buyer agent. Tell me what you need built or fixed, and paste the GitHub repository it's in." };
    return { ...none, ready: false, reply: 'I help you post small coding jobs. Describe the bug, test or feature you need, and share the GitHub repository. I get tests written, collect offers and only pay when the tests pass.' };
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

    /**
     * The New request chat. The agent talks normally and only posts a job once it has a task and a GitHub repository
     * the user typed themselves. Without n8n it answers with fallbackChat, so the page still works.
     */
    async chat(token: string, body: ChatRequest) {
        const authId = await this.authId(token);
        const turns: Turn[] = body.messages.slice(-30).map((m) => ({ role: m.role, text: m.text.trim() })).filter((m) => m.text);
        if (!turns.length || turns[turns.length - 1]!.role !== 'user') throw new BadRequestException('Send a message first');
        const r = (await this.agentsService.requestChat(authId, turns)) ?? fallbackChat(turns);
        const typed = turns.filter((m) => m.role === 'user').map((m) => m.text);
        /* only a repository the user wrote counts, never one the model made up */
        const mine = typed.map(repoIn).filter((x): x is string => !!x);
        const repo = mine.find((x) => x.toLowerCase() === (repoIn(r.repo_url) ?? '').toLowerCase()) ?? mine[mine.length - 1] ?? null;
        if (!r.ready) return { reply: r.reply, ready: false, job: null };
        if (!repo) return { reply: 'Before I post this, which GitHub repository is it for? Paste the link, like https://github.com/owner/repo.', ready: false, job: null };
        const description = (r.description || taskIn(turns)).trim().slice(0, 4000);
        if (description.length < 15) return { reply: 'What should be changed or fixed in that repository, and how will we know it is done?', ready: false, job: null };
        const title = r.title ? r.title.slice(0, 140) : titleOf(description);
        const created = await this.createRequest(token, { text: description, title, repo_url: repo } as CreateRequest);
        return {
            reply: `${r.reply} I posted it as ${created.ref}. The spec writer is reading the repository now.`,
            ready: true,
            job: { id: created.id, ref: created.ref, title, text: description, repo },
        };
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
