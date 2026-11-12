jest.mock('../prisma', () => ({ prisma: {} }));

import { Prisma } from '../generated/prisma/client';
import { SellerDirRow, SellersRepository } from './sellers.repository';
import { SellersService, toSellerDir } from './sellers.service';

const SELLER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const SVC = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const row = (over: Partial<SellerDirRow> = {}): SellerDirRow => ({
    id: SELLER, kind: 'human', nearAccountId: 'dana-ok.testnet', displayName: 'Dana Okafor', headline: 'Rust developer', priceFloor: new Prisma.Decimal(20),
    sellerProfile: { initials: 'DO', level: 'Level 2', online: true, about: 'Lagos. Rust and NEAR SDK.', langs: ['English', 'Yoruba'], days: 2, headline: 'Rust and NEAR contract fixes', country: 'Nigeria', skills: ['Rust', 'NEAR SDK'], categories: ['rust'], deliveryTerms: 'Includes one edge-case test', githubUsername: 'dana', priceFrom: new Prisma.Decimal(22) },
    services: [{ id: SVC, fromPrice: new Prisma.Decimal(25), days: 2 }, { id: 'other', fromPrice: new Prisma.Decimal(28), days: 3 }],
    ...over,
});
const stats = {
    reputation: new Map([['dana-ok.testnet', { settledJobs: 63, distinctBuyers: 44, settledVolume: new Prisma.Decimal(1890), firstTryPassRate: new Prisma.Decimal(95.4) }]]),
    rating: new Map([['dana-ok.testnet', 5]]),
};

describe('SellersService', () => {
    let repo: jest.Mocked<SellersRepository>;
    let service: SellersService;

    beforeEach(() => {
        repo = {
            getSellers: jest.fn().mockResolvedValue([row()]), getSeller: jest.fn().mockResolvedValue(row()), getStats: jest.fn().mockResolvedValue(stats),
        } as unknown as jest.Mocked<SellersRepository>;
        service = new SellersService(repo);
    });

    it('returns the SellerDir shape keyed by NEAR account', async () => {
        await expect(service.getSellers(' dana ', 'human')).resolves.toEqual([{
            key: 'dana-ok.testnet', id: SELLER, name: 'Dana Okafor', initials: 'DO', kind: 'human', level: 'Level 2', rating: 5, settled: 63, buyers: 44,
            pass: 95, volume: 1890, from: 25, acct: 'dana-ok.testnet', about: 'Lagos. Rust and NEAR SDK.', langs: 'English, Yoruba', online: true, gig: SVC, days: 2,
            headline: 'Rust and NEAR contract fixes', country: 'Nigeria', skills: ['Rust', 'NEAR SDK'], categories: ['rust'], terms: 'Includes one edge-case test', github: 'dana',
        }]);
        expect(repo.getSellers.mock.calls[0]?.[0]).toEqual({ kind: 'human', q: 'dana' });
    });

    it('refuses an unknown kind', async () => {
        await expect(service.getSellers(undefined, 'robot')).rejects.toThrow('Invalid seller kind');
    });

    it('falls back when there is no profile, service or reputation', () => {
        const dir = toSellerDir(row({ sellerProfile: null, services: [] }), { reputation: new Map(), rating: new Map() });
        expect(dir).toMatchObject({ initials: 'DO', level: 'New seller', rating: 0, settled: 0, pass: 0, volume: 0, from: 20, about: 'Rust developer', langs: 'English', online: false, gig: '', days: 1, headline: 'Rust developer', skills: [], categories: [], terms: '', github: '' });
    });

    it('finds one seller by id or NEAR account', async () => {
        await service.getSeller(SELLER);
        await service.getSeller('Dana-OK.testnet');
        expect(repo.getSeller.mock.calls).toEqual([[{ id: SELLER }], [{ nearAccountId: 'dana-ok.testnet' }]]);
        await expect(service.getSeller('not an account!')).rejects.toThrow('Seller id must be a valid id or NEAR account');
        repo.getSeller.mockResolvedValue(null);
        await expect(service.getSeller(SELLER)).rejects.toThrow('Seller not found');
    });
});
