import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

describe('AccountsController', () => {
    it('passes the token through to the service', async () => {
        const service = { getAccount: jest.fn().mockResolvedValue({ id: 'u' }), editAccount: jest.fn().mockResolvedValue({ message: 'ok' }) };
        const module = await Test.createTestingModule({
            controllers: [AccountsController],
            providers: [{ provide: AccountsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(AccountsController);
        await controller.getAccount('Bearer t');
        expect(service.getAccount).toHaveBeenCalledWith('Bearer t');
        await controller.editAccount('Bearer t', { mode: 'sell' } as never);
        expect(service.editAccount).toHaveBeenCalledWith('Bearer t', { mode: 'sell' });
    });
});
