import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { SpecsController } from './specs.controller';
import { SpecsService } from './specs.service';

describe('SpecsController', () => {
    let controller: SpecsController;
    const service = {
        createSpec: jest.fn().mockResolvedValue({ message: 'Spec Successfully Created', id: 'x', version: 1 }),
        createSpecs: jest.fn().mockResolvedValue({ message: 'Specs Successfully Created', ids: ['x'] }),
        lockSpec: jest.fn().mockResolvedValue({ message: 'Spec Successfully Locked', id: 'x', specHash: 'h', holdoutHash: null }),
        getSpecs: jest.fn().mockResolvedValue({ id: 'x' }),
        getSpec: jest.fn().mockResolvedValue({ id: 'x' }),
        editSpec: jest.fn().mockResolvedValue({ message: 'Spec Successfully Edited', id: 'x' }),
        deleteSpec: jest.fn().mockResolvedValue({ message: 'Spec Successfully Deleted' }),
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            controllers: [SpecsController],
            providers: [{ provide: SpecsService, useValue: service }],
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();
        controller = module.get(SpecsController);
    });

    it('passes the token and body through to the service', async () => {
        const body = { job_id: 'J-1042' } as never;
        await controller.createSpec('Bearer t', body);
        expect(service.createSpec).toHaveBeenCalledWith('Bearer t', body);
        await controller.lockSpec('Bearer t', { id: 'x' });
        expect(service.lockSpec).toHaveBeenCalledWith('Bearer t', { id: 'x' });
        await controller.getSpecs('Bearer t', 'J-1042');
        expect(service.getSpecs).toHaveBeenCalledWith('Bearer t', 'J-1042');
        await controller.deleteSpec('Bearer t', 'x');
        expect(service.deleteSpec).toHaveBeenCalledWith('Bearer t', 'x');
    });
});
