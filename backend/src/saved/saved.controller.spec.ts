import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { SavedController } from './saved.controller';
import { SavedService } from './saved.service';

describe('SavedController', () => {
    it('passes the token, body and id through to the service', async () => {
        const service = {
            getSaved: jest.fn().mockResolvedValue({}), createSaved: jest.fn().mockResolvedValue({}), createSavedBulk: jest.fn().mockResolvedValue({}), deleteSaved: jest.fn().mockResolvedValue({}),
        };
        const module = await Test.createTestingModule({
            controllers: [SavedController],
            providers: [{ provide: SavedService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(SavedController);
        await controller.getSaved('Bearer t');
        expect(service.getSaved.mock.calls[0]).toEqual(['Bearer t']);
        await controller.createSaved('Bearer t', { kind: 'service', target_id: 'x' } as never);
        expect(service.createSaved.mock.calls[0]).toEqual(['Bearer t', { kind: 'service', target_id: 'x' }]);
        await controller.createSavedBulk('Bearer t', { items: [] } as never);
        expect(service.createSavedBulk.mock.calls[0]).toEqual(['Bearer t', { items: [] }]);
        await controller.deleteSaved('Bearer t', 'x');
        expect(service.deleteSaved.mock.calls[0]).toEqual(['Bearer t', 'x']);
    });
});
