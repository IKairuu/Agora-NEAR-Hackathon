import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
    it('passes the token and body through to the service', async () => {
        const service = { getWallet: jest.fn().mockResolvedValue({}), createWithdrawal: jest.fn().mockResolvedValue({}), createDeposit: jest.fn().mockResolvedValue({}) };
        const module = await Test.createTestingModule({
            controllers: [WalletController],
            providers: [{ provide: WalletService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(WalletController);
        await controller.getWallet('Bearer t');
        expect(service.getWallet).toHaveBeenCalledWith('Bearer t');
        await controller.createWithdrawal('Bearer t', { amount: 1 });
        expect(service.createWithdrawal).toHaveBeenCalledWith('Bearer t', { amount: 1 });
        await controller.createDeposit('Bearer t', { amount: 2 });
        expect(service.createDeposit).toHaveBeenCalledWith('Bearer t', { amount: 2 });
    });
});
