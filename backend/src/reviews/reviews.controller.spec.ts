import { Test } from '@nestjs/testing';

jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthGuard } from '../auth/auth.guard';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('ReviewsController', () => {
    it('passes the token, query and body through to the service', async () => {
        const service = {
            getReviews: jest.fn().mockResolvedValue({}),
            getEvidence: jest.fn().mockResolvedValue({}),
            rerunReview: jest.fn().mockResolvedValue({ message: 'ok' }),
        };
        const module = await Test.createTestingModule({
            controllers: [ReviewsController],
            providers: [{ provide: ReviewsService, useValue: service }],
        }).overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(ReviewsController);
        await controller.getReviews('Bearer t', 'J-1042');
        expect(service.getReviews).toHaveBeenCalledWith('Bearer t', 'J-1042');
        await controller.getEvidence('Bearer t', 'J-1042');
        expect(service.getEvidence).toHaveBeenCalledWith('Bearer t', 'J-1042');
        await controller.rerunReview('Bearer t', { delivery_id: 'd' } as never);
        expect(service.rerunReview).toHaveBeenCalledWith('Bearer t', { delivery_id: 'd' });
    });
});
