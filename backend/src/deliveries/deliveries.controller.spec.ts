import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

describe('DeliveriesController', () => {
    it('passes the token, body, query and id through to the service', async () => {
        const service = {
            createDelivery: jest.fn().mockResolvedValue({ message: 'ok' }),
            getDeliveries: jest.fn().mockResolvedValue({ items: [] }),
            getProof: jest.fn().mockResolvedValue({ id: 'd' }),
        };
        const module = await Test.createTestingModule({
            controllers: [DeliveriesController],
            providers: [{ provide: DeliveriesService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(DeliveriesController);
        await controller.createDelivery('Bearer t', { job_id: 'J-1042' } as never);
        expect(service.createDelivery).toHaveBeenCalledWith('Bearer t', { job_id: 'J-1042' });
        await controller.getDeliveries('Bearer t', 'J-1042');
        expect(service.getDeliveries).toHaveBeenCalledWith('Bearer t', 'J-1042');
        await controller.getProof('Bearer t', 'd');
        expect(service.getProof).toHaveBeenCalledWith('Bearer t', 'd');
    });
});
