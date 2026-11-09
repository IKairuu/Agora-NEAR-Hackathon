jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { MessagesRepository, ThreadRow } from './messages.repository';
import { MessagesService, timeLabel } from './messages.service';

const BUYER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SELLER_USER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const THREAD = '3b4c5d6e-7f80-4192-a3b4-c5d6e7f80912';
const SELLER = '7e6d5c4b-3a29-4180-9f8e-7d6c5b4a3928';

const thread = (): ThreadRow => ({
    id: THREAD, title: 'Fix wallet selector modal on Safari 18', buyerId: BUYER, lastMessageAt: new Date(), createdAt: new Date(),
    job: { ref: 'J-1041' }, buyer: { displayName: 'Lumen Labs' }, seller: { id: SELLER, ownerId: SELLER_USER, displayName: 'Ines Varga' },
    messages: [{ body: 'Delivery tomorrow.', createdAt: new Date() }],
}) as ThreadRow;

describe('MessagesService', () => {
    let repo: jest.Mocked<MessagesRepository>;
    let service: MessagesService;
    let caller = BUYER;

    beforeEach(() => {
        caller = BUYER;
        repo = {
            getThreads: jest.fn(), getThread: jest.fn(), getOwnedJob: jest.fn(), getSeller: jest.fn(),
            getBiddingSeller: jest.fn(), createThread: jest.fn().mockResolvedValue({ id: THREAD }), getMessages: jest.fn(), createMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
        } as unknown as jest.Mocked<MessagesRepository>;
        service = new MessagesService(repo, { verifySessionToken: jest.fn(async () => caller) } as unknown as AuthService);
    });

    it('shows the other party and the side in the inbox', async () => {
        repo.getThreads.mockResolvedValue([thread()]);
        await expect(service.getThreads('Bearer t', 'all')).resolves.toEqual([expect.objectContaining({ with: 'Ines Varga', side: 'buy', jobId: 'J-1041', last: 'Delivery tomorrow.' })]);
        caller = SELLER_USER;
        await expect(service.getThreads('Bearer t', 'all')).resolves.toEqual([expect.objectContaining({ with: 'Lumen Labs', side: 'sell' })]);
    });

    it('maps senders to me and them for each side', async () => {
        repo.getThread.mockResolvedValue(thread());
        repo.getMessages.mockResolvedValue([
            { id: 'a', sender: 'owner', body: 'Check 1280 too.', cardType: null, createdAt: new Date() },
            { id: 'b', sender: 'seller', body: 'Will do.', cardType: null, createdAt: new Date() },
            { id: 'c', sender: 'agent', body: 'Escrow funded.', cardType: 'escrow', createdAt: new Date() },
        ]);
        expect((await service.getMessages('Bearer t', THREAD)).map((m) => m.from)).toEqual(['me', 'them', 'agent']);
        caller = SELLER_USER;
        expect((await service.getMessages('Bearer t', THREAD)).map((m) => m.from)).toEqual(['them', 'me', 'agent']);
    });

    it('notifies the other party when a message is sent', async () => {
        repo.getThread.mockResolvedValue(thread());
        await service.createMessage('Bearer t', THREAD, { text: ' Good. ' });
        expect(repo.createMessage.mock.calls[0]).toEqual([THREAD, 'owner', BUYER, 'Good.', { userId: SELLER_USER, title: 'Fix wallet selector modal on Safari 18' }]);
    });

    it('lets a buyer start a thread with a seller but not with themselves', async () => {
        repo.getSeller.mockResolvedValue({ id: SELLER, ownerId: SELLER_USER });
        await expect(service.createThread('Bearer t', { seller_id: SELLER, text: 'Hi' } as never)).resolves.toEqual({ message: 'Thread Successfully Created', id: THREAD });
        repo.getSeller.mockResolvedValue({ id: SELLER, ownerId: BUYER });
        await expect(service.createThread('Bearer t', { seller_id: SELLER, text: 'Hi' } as never)).rejects.toThrow('yourself');
    });

    it('needs an offer before a seller can message a buyer', async () => {
        caller = SELLER_USER;
        repo.getBiddingSeller.mockResolvedValue(null);
        await expect(service.createThread('Bearer t', { job_id: 'J-1042', text: 'Hi' } as never)).rejects.toThrow('Make an offer');
    });

    it('labels times like the inbox', () => {
        const now = new Date('2026-11-09T12:00:00Z');
        expect(timeLabel(new Date('2026-11-09T10:42:00Z'), now)).toBe('10:42');
        expect(timeLabel(new Date('2026-11-08T18:20:00Z'), now)).toBe('Yesterday');
        expect(timeLabel(new Date('2026-11-04T09:00:00Z'), now)).toBe('Wed');
        expect(timeLabel(new Date('2026-10-30T09:00:00Z'), now)).toBe('30 Oct');
    });
});
