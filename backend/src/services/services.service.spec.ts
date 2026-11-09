jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { GigRow, ServicesRepository } from './services.repository';
import { categorySlug, ServicesService, toGig } from './services.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const SVC = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const SELLER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const row = (over: Partial<GigRow> = {}): GigRow => ({
    id: SVC, title: 'I will fix a failing Rust test in your NEAR contract', thumb: 'test', tone: 'night', category: 'rust',
    fromPrice: new Prisma.Decimal(15), days: 1, prompt: 'Fix the failing test.', active: true,
    seller: { id: SELLER, kind: 'agent', nearAccountId: 'patchsmith.agents.testnet', displayName: 'patchsmith', sellerProfile: { initials: 'PA', level: 'Top rated', online: true } },
    ...over,
});

const body = { title: 'Fix a test', thumb: 'test', tone: 'night', category: 'Smart contracts', from_price: 15, days: 1, prompt: 'Fix it' } as never;

describe('ServicesService', () => {
    let repo: jest.Mocked<ServicesRepository>;
    let service: ServicesService;

    beforeEach(() => {
        repo = {
            getServices: jest.fn().mockResolvedValue([row()]), getService: jest.fn().mockResolvedValue(row()),
            getStats: jest.fn().mockResolvedValue({ settled: new Map([['patchsmith.agents.testnet', 41]]), rating: new Map([['patchsmith.agents.testnet', 4.9]]) }),
            getOwnSeller: jest.fn().mockResolvedValue({ id: SELLER }), getOwnServices: jest.fn().mockResolvedValue([]),
            createServices: jest.fn().mockResolvedValue([{ id: SVC }]), editService: jest.fn().mockResolvedValue({ count: 1 }), deleteService: jest.fn().mockResolvedValue({ count: 1 }),
        } as unknown as jest.Mocked<ServicesRepository>;
        service = new ServicesService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService);
    });

    it('maps categories by slug or label', () => {
        expect(categorySlug('Smart contracts')).toBe('rust');
        expect(categorySlug('fe')).toBe('fe');
        expect(categorySlug('All')).toBeUndefined();
        expect(categorySlug(undefined)).toBeUndefined();
        expect(() => categorySlug('Design')).toThrow('Invalid category');
    });

    it('lists services in the Gig shape with plain numbers', async () => {
        await expect(service.getServices('Smart contracts', '  rust ')).resolves.toEqual([{
            id: SVC, thumb: 'test', tone: 'night', seller: 'patchsmith', sellerKey: 'patchsmith.agents.testnet', initials: 'PA', kind: 'agent', level: 'Top rated',
            title: 'I will fix a failing Rust test in your NEAR contract', rating: 4.9, count: 41, from: 15, days: 1, cat: 'Smart contracts', online: true, prompt: 'Fix the failing test.',
        }]);
        expect(repo.getServices.mock.calls[0]?.[0]).toEqual({ category: 'rust', q: 'rust' });
        expect(repo.getStats.mock.calls[0]?.[0]).toEqual(['patchsmith.agents.testnet']);
    });

    it('falls back to a computed level and initials without a seller profile', () => {
        const gig = toGig(row({ seller: { id: SELLER, kind: 'human', nearAccountId: 'kofi-m.testnet', displayName: 'Kofi Mensah', sellerProfile: null } }), { settled: new Map(), rating: new Map() });
        expect(gig).toMatchObject({ initials: 'KM', level: 'New seller', rating: 0, count: 0, online: false });
    });

    it('reads one service and refuses bad or missing ids', async () => {
        await expect(service.getService(SVC)).resolves.toMatchObject({ id: SVC, from: 15 });
        await expect(service.getService('g1')).rejects.toThrow('Service id must be a valid id');
        repo.getService.mockResolvedValue(null);
        await expect(service.getService(SVC)).rejects.toThrow('Service not found');
    });

    it('creates a service under the caller seller with the category slug', async () => {
        await expect(service.createService('Bearer t', body)).resolves.toEqual({ message: 'Service Successfully Created', id: SVC });
        expect(repo.createServices.mock.calls[0]).toEqual([USER, SELLER, [{ title: 'Fix a test', thumb: 'test', tone: 'night', category: 'rust', fromPrice: 15, days: 1, prompt: 'Fix it', active: true }]]);
    });

    it('needs a published seller to create', async () => {
        repo.getOwnSeller.mockResolvedValue(null);
        await expect(service.createService('Bearer t', body)).rejects.toThrow('Publish your seller profile first');
    });

    it('creates in bulk', async () => {
        await expect(service.createServices('Bearer t', { items: [body] } as never)).resolves.toEqual({ message: 'Services Successfully Created', ids: [SVC] });
    });

    it('edits and deletes only the caller rows', async () => {
        await expect(service.editService('Bearer t', { ...(body as object), id: SVC } as never)).resolves.toEqual({ message: 'Service Successfully Updated', id: SVC });
        expect(repo.editService.mock.calls[0]?.[0]).toBe(USER);
        await expect(service.deleteService('Bearer t', SVC)).resolves.toEqual({ message: 'Service Successfully Deleted', id: SVC });
        expect(repo.deleteService.mock.calls[0]).toEqual([USER, SVC]);
        repo.editService.mockResolvedValue({ count: 0 });
        await expect(service.editService('Bearer t', { ...(body as object), id: SVC } as never)).rejects.toThrow('Service not found');
        repo.deleteService.mockResolvedValue({ count: 0 });
        await expect(service.deleteService('Bearer t', SVC)).rejects.toThrow('Service not found');
        await expect(service.deleteService('Bearer t', 'nope')).rejects.toThrow('Service id must be a valid id');
    });

    it('lists the caller services', async () => {
        await expect(service.getOwnServices('Bearer t')).resolves.toEqual([]);
        expect(repo.getOwnServices.mock.calls[0]).toEqual([USER]);
    });
});
