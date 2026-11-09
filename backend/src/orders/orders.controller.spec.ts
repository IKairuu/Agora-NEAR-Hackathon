import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
    it('passes the token and inputs through to the service', async () => {
        const service = { getOrders: jest.fn(), declineRequest: jest.fn() };
        const module = await Test.createTestingModule({
            controllers: [OrdersController],
            providers: [{ provide: OrdersService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(OrdersController);
        await controller.getOrders('Bearer t');
        expect(service.getOrders).toHaveBeenCalledWith('Bearer t');
        await controller.declineRequest('Bearer t', 'J-1050');
        expect(service.declineRequest).toHaveBeenCalledWith('Bearer t', 'J-1050');
    });
});
