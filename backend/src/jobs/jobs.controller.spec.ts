import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
    it('passes the token and inputs through to the service', async () => {
        const service = { getJobs: jest.fn().mockResolvedValue([]), getJob: jest.fn().mockResolvedValue({}), publishJob: jest.fn().mockResolvedValue({}) };
        const module = await Test.createTestingModule({
            controllers: [JobsController],
            providers: [{ provide: JobsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(JobsController);
        await controller.getJobs('Bearer t', 'offers');
        expect(service.getJobs).toHaveBeenCalledWith('Bearer t', 'offers');
        await controller.getJob('Bearer t', 'J-1042');
        expect(service.getJob).toHaveBeenCalledWith('Bearer t', 'J-1042');
        await controller.publishJob('Bearer t', { id: 'J-1042' });
        expect(service.publishJob).toHaveBeenCalledWith('Bearer t', { id: 'J-1042' });
    });
});
