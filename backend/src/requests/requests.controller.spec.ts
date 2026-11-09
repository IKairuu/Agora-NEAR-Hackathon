import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

describe('RequestsController', () => {
    it('passes the token and inputs through to the service', async () => {
        const service = { createRequest: jest.fn().mockResolvedValue({}), createRequests: jest.fn(), editRequest: jest.fn(), keepWaiting: jest.fn().mockResolvedValue({}) };
        const module = await Test.createTestingModule({
            controllers: [RequestsController],
            providers: [{ provide: RequestsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(RequestsController);
        await controller.createRequest('Bearer t', { text: 'x' } as never);
        expect(service.createRequest).toHaveBeenCalledWith('Bearer t', { text: 'x' });
        await controller.keepWaiting('Bearer t', 'id');
        expect(service.keepWaiting).toHaveBeenCalledWith('Bearer t', 'id');
    });
});
