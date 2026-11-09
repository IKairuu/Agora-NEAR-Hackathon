import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { MandatesController } from './mandates.controller';
import { MandatesService } from './mandates.service';

describe('MandatesController', () => {
    it('passes the token and body through to the service', async () => {
        const service = { getMandate: jest.fn(), editMandate: jest.fn(), pauseAgents: jest.fn(), unpauseAgents: jest.fn() };
        const module = await Test.createTestingModule({
            controllers: [MandatesController],
            providers: [{ provide: MandatesService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(MandatesController);
        await controller.getMandate('Bearer t');
        expect(service.getMandate).toHaveBeenCalledWith('Bearer t');
        await controller.editMandate('Bearer t', { daily_cap: 100 } as never);
        expect(service.editMandate).toHaveBeenCalledWith('Bearer t', { daily_cap: 100 });
        await controller.pauseAgents('Bearer t');
        expect(service.pauseAgents).toHaveBeenCalledWith('Bearer t');
        await controller.unpauseAgents('Bearer t');
        expect(service.unpauseAgents).toHaveBeenCalledWith('Bearer t');
    });
});
