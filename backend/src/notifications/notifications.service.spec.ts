jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';

describe('NotificationsService', () => {
    let repo: jest.Mocked<NotificationsRepository>;
    let service: NotificationsService;

    beforeEach(() => {
        repo = { getNotifications: jest.fn(), readNotifications: jest.fn().mockResolvedValue(2) } as unknown as jest.Mocked<NotificationsRepository>;
        service = new NotificationsService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService);
    });

    it('returns the bell shape with an unread count', async () => {
        repo.getNotifications.mockResolvedValue([
            { id: 'a', kind: 'offer', title: 'New offer on J-1042', body: 'patchsmith offered 36.00', link: '/job?id=J-1042', read: false, createdAt: new Date() },
            { id: 'b', kind: 'message', title: 'Ines Varga', body: null, link: null, read: true, createdAt: new Date() },
        ]);
        const result = await service.getNotifications('Bearer t');
        expect(result.unread).toBe(1);
        expect(result.items[0]).toMatchObject({ text: 'New offer on J-1042: patchsmith offered 36.00', time: 'just now', read: false });
        expect(result.items[1]!.text).toBe('Ines Varga');
    });

    it('marks all as read when no ids are sent', async () => {
        await expect(service.readNotifications('Bearer t', {} as never)).resolves.toEqual({ message: 'Notifications Successfully Read', count: 2 });
        expect(repo.readNotifications.mock.calls[0]).toEqual([USER, null]);
    });
});
