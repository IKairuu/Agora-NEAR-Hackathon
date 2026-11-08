import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { SellerProfileController } from './seller-profile.controller';
import { SellerProfileService } from './seller-profile.service';

describe('SellerProfileController', () => {
    it('passes the token and body through to the service', async () => {
        const service = {
            getProfile: jest.fn().mockResolvedValue({ step: 0 }),
            editProfile: jest.fn().mockResolvedValue({ message: 'ok' }),
            publishProfile: jest.fn().mockResolvedValue({ message: 'ok' }),
        };
        const module = await Test.createTestingModule({
            controllers: [SellerProfileController],
            providers: [{ provide: SellerProfileService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(SellerProfileController);
        await controller.getProfile('Bearer t');
        expect(service.getProfile).toHaveBeenCalledWith('Bearer t');
        await controller.editProfile('Bearer t', { step: 1 } as never);
        expect(service.editProfile).toHaveBeenCalledWith('Bearer t', { step: 1 });
        await controller.publishProfile('Bearer t');
        expect(service.publishProfile).toHaveBeenCalledWith('Bearer t');
    });
});
