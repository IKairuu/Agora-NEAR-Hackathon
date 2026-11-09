import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsService } from './negotiations.service';

describe('NegotiationsController', () => {
    it('passes the token and inputs through to the service', async () => {
        const service = { createNegotiation: jest.fn(), createNegotiations: jest.fn(), getNegotiations: jest.fn(), hireSeller: jest.fn(), getOffer: jest.fn(), acceptOffer: jest.fn(), declineOffer: jest.fn() };
        const module = await Test.createTestingModule({
            controllers: [NegotiationsController],
            providers: [{ provide: NegotiationsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(NegotiationsController);
        await controller.hireSeller('Bearer t', { bid_id: 'b' } as never);
        expect(service.hireSeller).toHaveBeenCalledWith('Bearer t', { bid_id: 'b' });
        await controller.acceptOffer('Bearer t', 'o');
        expect(service.acceptOffer).toHaveBeenCalledWith('Bearer t', 'o');
        await controller.declineOffer('Bearer t', 'o');
        expect(service.declineOffer).toHaveBeenCalledWith('Bearer t', 'o');
    });
});
