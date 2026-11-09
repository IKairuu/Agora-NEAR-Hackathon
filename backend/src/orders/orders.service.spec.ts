jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { JobBrief, OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const USER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const job = (ref: string, status: string, extra: Partial<JobBrief> = {}): JobBrief => ({
    id: `id-${ref}`, ref, title: `Job ${ref}`, status, budgetLabel: '30–60', agreedPrice: null, updatedAt: new Date(), buyerId: 'b',
    buyer: { displayName: 'Kanso Pay' }, categoryRef: { name: 'Front-end' }, ...extra,
}) as JobBrief;

describe('OrdersService', () => {
    let repo: jest.Mocked<OrdersRepository>;
    let service: OrdersService;

    beforeEach(() => {
        repo = {
            getMySellerIds: jest.fn().mockResolvedValue(['s1']), getMyServiceIds: jest.fn().mockResolvedValue(['svc1']),
            getWonJobs: jest.fn().mockResolvedValue([]), getHireOffers: jest.fn().mockResolvedValue([]), getMyBids: jest.fn().mockResolvedValue([]),
            getDirectRequests: jest.fn().mockResolvedValue([]), declineRequest: jest.fn(),
        } as unknown as jest.Mocked<OrdersRepository>;
        service = new OrdersService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService);
    });

    it('builds the seller pipeline in the Order shape', async () => {
        repo.getDirectRequests.mockResolvedValue([job('R-2051', 'draft')]);
        repo.getMyBids.mockResolvedValue([{ id: 'bid1', price: 52 as never, deliveryDays: 2, status: 'live', job: job('J-1044', 'open') }]);
        repo.getWonJobs.mockResolvedValue([job('J-1039', 'funded', { agreedPrice: 31 as never }), job('J-1031', 'settled', { agreedPrice: 18 as never })]);
        const orders = await service.getOrders('Bearer t');
        expect(orders.map((o) => [o.id, o.st])).toEqual([['J-1039', 2], ['J-1031', 4], ['J-1044', 1], ['R-2051', 0]]);
        expect(orders.find((o) => o.id === 'J-1044')).toMatchObject({ price: '52.00', note: 'Your offer: 52.00 USDC in 2 days. Waiting for the buyer.', bidId: 'bid1' });
        expect(orders.find((o) => o.id === 'J-1039')!.price).toBe('31.00');
    });

    it('shows a hire offer as incoming instead of the bid', async () => {
        const j = job('J-1042', 'negotiating');
        repo.getHireOffers.mockResolvedValue([{ id: 'ho1', price: 32 as never, job: j }]);
        repo.getMyBids.mockResolvedValue([{ id: 'bid1', price: 36 as never, deliveryDays: 1, status: 'live', job: j }]);
        const orders = await service.getOrders('Bearer t');
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({ st: 0, hireOfferId: 'ho1', price: '32.00' });
    });

    it('returns nothing for a user without a seller profile', async () => {
        repo.getMySellerIds.mockResolvedValue([]);
        await expect(service.getOrders('Bearer t')).resolves.toEqual([]);
    });
});
