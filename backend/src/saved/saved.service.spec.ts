jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { SavedRepository, SavedRow } from './saved.repository';
import { SavedService } from './saved.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SVC = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const SELLER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ITEM = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const sellerRow = {
    id: SELLER, kind: 'human' as const, nearAccountId: 'dana-ok.testnet', displayName: 'Dana Okafor', headline: null, priceFloor: null,
    sellerProfile: null, services: [{ id: SVC, fromPrice: new Prisma.Decimal(25), days: 2 }],
};
const serviceRow = {
    id: SVC, title: 'I will add a paginated view', thumb: 'contract' as const, tone: 'grad' as const, category: 'rust', fromPrice: new Prisma.Decimal(25), days: 2, prompt: 'Add it.', active: true,
    seller: { id: SELLER, kind: 'human' as const, nearAccountId: 'dana-ok.testnet', displayName: 'Dana Okafor', sellerProfile: null },
};

describe('SavedService', () => {
    let repo: jest.Mocked<SavedRepository>;
    let service: SavedService;

    beforeEach(() => {
        repo = {
            getSaved: jest.fn().mockResolvedValue([
                { id: ITEM, kind: 'service', serviceId: SVC, sellerId: null, createdAt: new Date(0), service: serviceRow, seller: null },
                { id: 'i2', kind: 'seller', serviceId: null, sellerId: SELLER, createdAt: new Date(0), service: null, seller: sellerRow },
            ] as SavedRow[]),
            findService: jest.fn().mockResolvedValue({ id: SVC }), findSeller: jest.fn().mockResolvedValue({ id: SELLER }),
            getStats: jest.fn().mockResolvedValue({ reputation: new Map([['dana-ok.testnet', { settledJobs: 63, distinctBuyers: 44, settledVolume: new Prisma.Decimal(1890), firstTryPassRate: null }]]), rating: new Map() }),
            createSaved: jest.fn().mockResolvedValue({ id: ITEM }), deleteSaved: jest.fn().mockResolvedValue({ count: 1 }),
        } as unknown as jest.Mocked<SavedRepository>;
        service = new SavedService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService);
    });

    it('lists the caller saved items with the Gig and SellerDir shapes', async () => {
        const res = await service.getSaved('Bearer t');
        expect(repo.getSaved.mock.calls[0]).toEqual([USER]);
        expect(repo.getStats.mock.calls[0]?.[0]).toEqual(['dana-ok.testnet']);
        expect(res.services).toEqual([SVC]);
        expect(res.sellers).toEqual(['dana-ok.testnet']);
        expect(res.items[0]).toMatchObject({ id: ITEM, kind: 'service', targetId: SVC, gig: { id: SVC, from: 25, count: 63, cat: 'Smart contracts' }, seller: null });
        expect(res.items[1]).toMatchObject({ kind: 'seller', targetId: SELLER, gig: null, seller: { key: 'dana-ok.testnet', settled: 63 } });
    });

    it('saves a service once', async () => {
        await expect(service.createSaved('Bearer t', { kind: 'service', target_id: SVC })).resolves.toEqual({ message: 'Saved Successfully Created', id: ITEM, kind: 'service', targetId: SVC });
        expect(repo.createSaved.mock.calls[0]).toEqual([USER, 'service', SVC]);
        await expect(service.createSaved('Bearer t', { kind: 'service', target_id: 'g1' })).rejects.toThrow('Service id must be a valid id');
        repo.findService.mockResolvedValue(null);
        await expect(service.createSaved('Bearer t', { kind: 'service', target_id: SVC })).rejects.toThrow('Service not found');
    });

    it('saves a seller by NEAR account', async () => {
        await service.createSaved('Bearer t', { kind: 'seller', target_id: 'dana-ok.testnet' });
        expect(repo.findSeller.mock.calls[0]).toEqual([{ nearAccountId: 'dana-ok.testnet' }]);
        expect(repo.createSaved.mock.calls[0]).toEqual([USER, 'seller', SELLER]);
        await expect(service.createSaved('Bearer t', { kind: 'seller', target_id: 'bad account!' })).rejects.toThrow('Seller id must be a valid id or NEAR account');
        repo.findSeller.mockResolvedValue(null);
        await expect(service.createSaved('Bearer t', { kind: 'seller', target_id: SELLER })).rejects.toThrow('Seller not found');
    });

    it('saves in bulk', async () => {
        await expect(service.createSavedBulk('Bearer t', { items: [{ kind: 'service', target_id: SVC }] })).resolves.toEqual({ message: 'Saved Successfully Created', ids: [ITEM] });
    });

    it('deletes by saved id, target id or seller account', async () => {
        await expect(service.deleteSaved('Bearer t', SVC)).resolves.toEqual({ message: 'Saved Successfully Deleted', id: SVC });
        await service.deleteSaved('Bearer t', 'dana-ok.testnet');
        expect(repo.deleteSaved.mock.calls).toEqual([[USER, SVC], [USER, SELLER]]);
        await expect(service.deleteSaved('Bearer t', 'bad id!')).rejects.toThrow('Saved id must be a valid id');
        repo.deleteSaved.mockResolvedValue({ count: 0 });
        await expect(service.deleteSaved('Bearer t', SVC)).rejects.toThrow('Saved item not found');
        repo.findSeller.mockResolvedValue(null);
        await expect(service.deleteSaved('Bearer t', 'gone.testnet')).rejects.toThrow('Saved item not found');
    });
});
