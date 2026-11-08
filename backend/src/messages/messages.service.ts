import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { CreateMessage } from './dto/CreateMessage.dto.js';
import { CreateThread } from './dto/CreateThread.dto.js';
import { JobKey, MessagesRepository, ThreadRow } from './messages.repository.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const timeLabel = (date: Date | null, now = new Date()): string => {
    if (!date) return '';
    const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diff = Math.round((day(now) - day(date)) / 86400000);
    if (diff <= 0) return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return DAYS[date.getUTCDay()]!;
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};

const FROM_BUYER: Record<string, string> = { owner: 'me', seller: 'them', agent: 'agent', system: 'sys' };
const FROM_SELLER: Record<string, string> = { owner: 'them', seller: 'me', agent: 'agent', system: 'sys' };

export const toThread = (row: ThreadRow, userId: string) => {
    const buying = row.buyerId === userId;
    const last = row.messages[0];
    return {
        id: row.id,
        title: row.title,
        with: buying ? (row.seller?.displayName ?? '') : (row.buyer.displayName ?? 'Buyer'),
        side: buying ? 'buy' : 'sell',
        jobId: row.job?.ref ?? null,
        last: last?.body ?? '',
        time: timeLabel(last?.createdAt ?? row.lastMessageAt ?? row.createdAt),
    };
};

@Injectable()
export class MessagesService {
    constructor(
        private readonly messagesRepository: MessagesRepository,
        private readonly authService: AuthService,
    ) {}

    async getThreads(token: string, side: string) {
        const authId = await this.authId(token);
        const rows = await this.messagesRepository.getThreads(authId, side ?? 'all');
        return rows.map((r) => toThread(r, authId));
    }

    async createThread(token: string, body: CreateThread) {
        const authId = await this.authId(token);
        const text = body.text.trim();
        if (body.seller_id) {
            const seller = await this.messagesRepository.getSeller(body.seller_id);
            if (!seller) throw new NotFoundException('Seller not found');
            if (seller.ownerId === authId) throw new ForbiddenException('You cannot message yourself');
            const job = body.job_id ? await this.messagesRepository.getOwnedJob(authId, this.jobKey(body.job_id)) : null;
            if (body.job_id && !job) throw new NotFoundException('Job not found');
            const title = body.title ?? job?.title ?? 'New conversation';
            const row = await this.messagesRepository.createThread(
                { jobId: job?.id ?? null, buyerId: authId, sellerId: seller.id, title },
                { sender: 'owner', senderProfileId: authId, body: text, notifyUserId: seller.ownerId },
            );
            return { message: 'Thread Successfully Created', id: row.id };
        }
        if (!body.job_id) throw new BadRequestException('Choose a seller or a job');
        const bid = await this.messagesRepository.getBiddingSeller(authId, this.jobKey(body.job_id));
        if (!bid) throw new ForbiddenException('Make an offer on this job before messaging the buyer');
        const title = body.title ?? bid.job.title;
        const row = await this.messagesRepository.createThread(
            { jobId: bid.job.id, buyerId: bid.job.buyerId, sellerId: bid.seller.id, title },
            { sender: 'seller', senderProfileId: authId, body: text, notifyUserId: bid.job.buyerId },
        );
        return { message: 'Thread Successfully Created', id: row.id };
    }

    async getMessages(token: string, id: string) {
        const authId = await this.authId(token);
        const thread = await this.thread(authId, id);
        const map = thread.buyerId === authId ? FROM_BUYER : FROM_SELLER;
        const rows = await this.messagesRepository.getMessages(authId, thread.id);
        return rows.map((r) => ({ id: r.id, from: map[r.sender] ?? 'sys', text: r.body, card: r.cardType, time: timeLabel(r.createdAt), at: r.createdAt.toISOString() }));
    }

    async createMessage(token: string, id: string, body: CreateMessage) {
        const authId = await this.authId(token);
        const thread = await this.thread(authId, id);
        const buying = thread.buyerId === authId;
        const row = await this.messagesRepository.createMessage(thread.id, buying ? 'owner' : 'seller', authId, body.text.trim(), {
            userId: buying ? (thread.seller?.ownerId ?? null) : thread.buyerId,
            title: thread.title,
        });
        return { message: 'Message Successfully Sent', id: row.id };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job)) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }

    private async thread(authId: string, id: string): Promise<ThreadRow> {
        if (!isUUID(id)) throw new BadRequestException('Thread id must be a valid id');
        const row = await this.messagesRepository.getThread(authId, id);
        if (!row) throw new NotFoundException('Conversation not found');
        return row;
    }
}
