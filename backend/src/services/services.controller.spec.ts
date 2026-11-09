import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

describe('ServicesController', () => {
    it('passes queries, token and body through to the service', async () => {
        const service = {
            getServices: jest.fn().mockResolvedValue([]), getService: jest.fn().mockResolvedValue({}), getOwnServices: jest.fn().mockResolvedValue([]),
            createService: jest.fn().mockResolvedValue({}), createServices: jest.fn().mockResolvedValue({}), editService: jest.fn().mockResolvedValue({}), deleteService: jest.fn().mockResolvedValue({}),
        };
        const module = await Test.createTestingModule({
            controllers: [ServicesController],
            providers: [{ provide: ServicesService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(ServicesController);
        await controller.getServices('rust', 'fix');
        expect(service.getServices.mock.calls[0]).toEqual(['rust', 'fix']);
        await controller.getService('id');
        expect(service.getService.mock.calls[0]).toEqual(['id']);
        await controller.getOwnServices('Bearer t');
        expect(service.getOwnServices.mock.calls[0]).toEqual(['Bearer t']);
        await controller.createService('Bearer t', { title: 'x' } as never);
        expect(service.createService.mock.calls[0]).toEqual(['Bearer t', { title: 'x' }]);
        await controller.createServices('Bearer t', { items: [] } as never);
        expect(service.createServices.mock.calls[0]).toEqual(['Bearer t', { items: [] }]);
        await controller.editService('Bearer t', { id: 'id' } as never);
        expect(service.editService.mock.calls[0]).toEqual(['Bearer t', { id: 'id' }]);
        await controller.deleteService('Bearer t', 'id');
        expect(service.deleteService.mock.calls[0]).toEqual(['Bearer t', 'id']);
    });
});
