import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
    it('passes the token and inputs through to the service', async () => {
        const service = { getNotifications: jest.fn(), readNotifications: jest.fn() };
        const module = await Test.createTestingModule({
            controllers: [NotificationsController],
            providers: [{ provide: NotificationsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(NotificationsController);
        await controller.getNotifications('Bearer t');
        expect(service.getNotifications).toHaveBeenCalledWith('Bearer t');
        await controller.readNotifications('Bearer t', { ids: ['a'] });
        expect(service.readNotifications).toHaveBeenCalledWith('Bearer t', { ids: ['a'] });
    });
});
