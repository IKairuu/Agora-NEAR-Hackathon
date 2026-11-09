import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

describe('SellersController', () => {
    it('passes the filters and id through to the service', async () => {
        const service = { getSellers: jest.fn().mockResolvedValue([]), getSeller: jest.fn().mockResolvedValue({}) };
        const module = await Test.createTestingModule({
            controllers: [SellersController],
            providers: [{ provide: SellersService, useValue: service }],
        }).compile();
        const controller = module.get(SellersController);
        await controller.getSellers('dana', 'human');
        expect(service.getSellers.mock.calls[0]).toEqual(['dana', 'human']);
        await controller.getSeller('dana-ok.testnet');
        expect(service.getSeller.mock.calls[0]).toEqual(['dana-ok.testnet']);
    });
});
