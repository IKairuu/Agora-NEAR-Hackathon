import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

describe('DisputesController', () => {
    it('passes the token, ids, query and body through to the service', async () => {
        const service = {
            createDispute: jest.fn().mockResolvedValue({ message: 'ok' }),
            getDispute: jest.fn().mockResolvedValue({}),
            getTreasury: jest.fn().mockResolvedValue({ balance: 1 }),
            escalateDispute: jest.fn().mockResolvedValue({ message: 'ok' }),
            ruleDispute: jest.fn().mockResolvedValue({ message: 'ok' }),
            finalizeDispute: jest.fn().mockResolvedValue({ message: 'ok' }),
        };
        const module = await Test.createTestingModule({
            controllers: [DisputesController],
            providers: [{ provide: DisputesService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(DisputesController);
        await controller.createDispute('Bearer t', { job_id: 'J-1042', reason: 'x' } as never);
        await controller.getDispute('Bearer t', 'J-1042');
        await controller.getTreasury();
        await controller.escalateDispute('Bearer t', 'd', { amount: 2 } as never);
        await controller.ruleDispute('Bearer t', 'd', { outcome: 'split', seller_share_bps: 7000 } as never);
        await controller.finalizeDispute('Bearer t', 'd');
        expect(service.createDispute.mock.calls[0]).toEqual(['Bearer t', { job_id: 'J-1042', reason: 'x' }]);
        expect(service.getDispute.mock.calls[0]).toEqual(['Bearer t', 'J-1042']);
        expect(service.getTreasury.mock.calls).toHaveLength(1);
        expect(service.escalateDispute.mock.calls[0]).toEqual(['Bearer t', 'd', { amount: 2 }]);
        expect(service.ruleDispute.mock.calls[0]).toEqual(['Bearer t', 'd', { outcome: 'split', seller_share_bps: 7000 }]);
        expect(service.finalizeDispute.mock.calls[0]).toEqual(['Bearer t', 'd']);
    });
});
