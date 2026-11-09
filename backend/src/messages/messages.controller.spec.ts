import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

describe('MessagesController', () => {
    it('passes the token and inputs through to the service', async () => {
        const service = { getThreads: jest.fn(), createThread: jest.fn(), getMessages: jest.fn(), createMessage: jest.fn() };
        const module = await Test.createTestingModule({
            controllers: [MessagesController],
            providers: [{ provide: MessagesService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(MessagesController);
        await controller.getThreads('Bearer t', 'buy');
        expect(service.getThreads).toHaveBeenCalledWith('Bearer t', 'buy');
        await controller.createMessage('Bearer t', 't1', { text: 'hi' });
        expect(service.createMessage).toHaveBeenCalledWith('Bearer t', 't1', { text: 'hi' });
    });
});
