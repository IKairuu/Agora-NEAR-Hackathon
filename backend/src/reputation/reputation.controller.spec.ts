import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';

describe('ReputationController', () => {
    it('passes the account, token and body through to the service', async () => {
        const service = { getReputation: jest.fn(), getRatings: jest.fn(), createRating: jest.fn() };
        const module = await Test.createTestingModule({
            controllers: [ReputationController],
            providers: [{ provide: ReputationService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(ReputationController);
        await controller.getReputation('patchsmith.testnet');
        expect(service.getReputation).toHaveBeenCalledWith('patchsmith.testnet');
        await controller.getRatings('patchsmith.testnet');
        expect(service.getRatings).toHaveBeenCalledWith('patchsmith.testnet');
        await controller.createRating('Bearer t', { job_id: 'J-1042', stars: 5 } as never);
        expect(service.createRating).toHaveBeenCalledWith('Bearer t', { job_id: 'J-1042', stars: 5 });
    });
});
