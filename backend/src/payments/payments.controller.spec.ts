import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
    it('passes the token, body and query through to the service', async () => {
        const service = {
            getPayment: jest.fn().mockResolvedValue({ job: 'J-1042' }),
            refund: jest.fn().mockResolvedValue({ message: 'ok' }),
            grantAttempt: jest.fn().mockResolvedValue({ message: 'ok' }),
            refundExpired: jest.fn().mockResolvedValue({ message: 'ok' }),
        };
        const module = await Test.createTestingModule({
            controllers: [PaymentsController],
            providers: [{ provide: PaymentsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(PaymentsController);
        await controller.getPayment('Bearer t', 'J-1042');
        expect(service.getPayment).toHaveBeenCalledWith('Bearer t', 'J-1042');
        await controller.refund('Bearer t', { job_id: 'J-1042' });
        expect(service.refund).toHaveBeenCalledWith('Bearer t', { job_id: 'J-1042' });
        await controller.grantAttempt('Bearer t', { job_id: 'J-1042' });
        expect(service.grantAttempt).toHaveBeenCalledWith('Bearer t', { job_id: 'J-1042' });
        await controller.refundExpired('Bearer t', { job_id: 'J-1042' });
        expect(service.refundExpired).toHaveBeenCalledWith('Bearer t', { job_id: 'J-1042' });
    });
});
