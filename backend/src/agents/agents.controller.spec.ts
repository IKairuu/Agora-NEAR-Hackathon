import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

describe('AgentsController', () => {
    it('passes the token and job filter through to the service', async () => {
        const service = { getAgents: jest.fn().mockResolvedValue({}), getEvents: jest.fn().mockResolvedValue({ items: [] }) };
        const module = await Test.createTestingModule({
            controllers: [AgentsController],
            providers: [{ provide: AgentsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(AgentsController);
        await controller.getAgents('Bearer t');
        expect(service.getAgents).toHaveBeenCalledWith('Bearer t');
        await controller.getEvents('Bearer t', 'J-1042');
        expect(service.getEvents).toHaveBeenCalledWith('Bearer t', 'J-1042');
    });
});
