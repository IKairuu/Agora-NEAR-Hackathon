jest.mock('../prisma', () => ({ prisma: {} }));

import { InternalRepository } from './internal.repository';
import { decideBid, InternalService } from './internal.service';

const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const BID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('InternalService', () => {
    let repo: jest.Mocked<InternalRepository>;
    let service: InternalService;

    beforeEach(() => {
        repo = {
            getJob: jest.fn().mockResolvedValue({ id: JOB, ref: 'J-1042', title: 'Split fix', buyerId: 'buyer', seller: { ownerId: 'seller' } }),
            getBid: jest.fn(), setBidStatus: jest.fn().mockResolvedValue(1), createNotifications: jest.fn(async (n: unknown[]) => n.length),
        } as unknown as jest.Mocked<InternalRepository>;
        service = new InternalService(repo);
    });

    const bid = (extra: object) => ({ id: BID, status: 'pending_check', price: 36, priceCheck: 'cleared', fraudScore: 6, holdReason: null, job: { id: JOB, ref: 'J-1042', buyerId: 'buyer' }, seller: { displayName: 'patchsmith', ownerId: 'seller' }, ...extra });

    it('makes a checked offer live and tells the buyer', async () => {
        repo.getBid.mockResolvedValue(bid({}) as never);
        const res = await service.agentNotify({ role: 'fraud_lure', ok: true, jobId: JOB, result: { subjectType: 'bid', subjectId: BID, score: 6 } });
        expect(repo.setBidStatus.mock.calls[0]).toEqual([BID, 'pending_check', 'live', null]);
        expect(repo.createNotifications.mock.calls[0]![0]).toEqual([expect.objectContaining({ userId: 'buyer', title: 'New offer on J-1042', body: 'patchsmith offered 36.00 USDC' })]);
        expect(res.actions).toEqual(['bid live', 'notified 1']);
    });

    it('holds a lure and tells both sides', async () => {
        repo.getBid.mockResolvedValue(bid({ fraudScore: 91 }) as never);
        await service.agentNotify({ role: 'fraud_lure', ok: true, jobId: JOB, result: { subjectType: 'bid', subjectId: BID } });
        expect(repo.setBidStatus.mock.calls[0]).toEqual([BID, 'pending_check', 'held', 'High fraud and lure risk']);
        expect(repo.createNotifications.mock.calls[0]![0]).toHaveLength(2);
    });

    it('waits for both checks before going live', () => {
        expect(decideBid({ status: 'pending_check', priceCheck: null, fraudScore: 6, holdReason: null })).toBeNull();
        expect(decideBid({ status: 'pending_check', priceCheck: 'held', fraudScore: null, holdReason: 'Price far below reference' })).toEqual({ status: 'held', reason: 'Price far below reference' });
        expect(decideBid({ status: 'accepted', priceCheck: 'held', fraudScore: 99, holdReason: null })).toBeNull();
    });

    it('tells the buyer when a draft spec is ready', async () => {
        await service.agentNotify({ role: 'spec_writer', ok: true, jobId: JOB, result: { failsOnBase: true } });
        expect(repo.createNotifications.mock.calls[0]![0][0]).toMatchObject({ userId: 'buyer', title: 'Draft spec ready for J-1042' });
    });

    it('rejects a malformed body', async () => {
        await expect(service.agentNotify({ role: 'reviewer' })).rejects.toThrow('Invalid agent result');
    });
});
