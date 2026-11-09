import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';

describe('BidsController', () => {
    it('passes the token and inputs through to the service', async () => {
        const service = { createBid: jest.fn(), createBids: jest.fn(), getBids: jest.fn(), editBid: jest.fn(), explainBid: jest.fn(), deleteBid: jest.fn() };
        const module = await Test.createTestingModule({
            controllers: [BidsController],
            providers: [{ provide: BidsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(BidsController);
        await controller.getBids('Bearer t', 'J-1042');
        expect(service.getBids).toHaveBeenCalledWith('Bearer t', 'J-1042');
        await controller.explainBid('Bearer t', 'b1', { explanation: 'fair' });
        expect(service.explainBid).toHaveBeenCalledWith('Bearer t', 'b1', { explanation: 'fair' });
    });
});
