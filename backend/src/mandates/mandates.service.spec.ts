jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { Prisma } from '../generated/prisma/client';
import { MandatesRepository } from './mandates.repository';
import { MandatesService } from './mandates.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const D = (n: number) => new Prisma.Decimal(n);
const saved = (over: object = {}) => ({
    perJobCap: D(40), dailyCap: D(100), newSellerCap: D(20), reviewWindowHours: 6, allowedCategories: ['rust'], strictSellers: false,
    paused: false, pausedBy: null, pausedAt: null, lastTxHash: 'mock-set_mandate-1', syncedAt: new Date(), ...over,
});
const profile = (mandate: unknown = null) => ({ nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet', mandate, approvedSellers: [] }) as never;

describe('MandatesService', () => {
    let repo: jest.Mocked<MandatesRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: MandatesService;

    beforeEach(() => {
        repo = {
            getMandate: jest.fn().mockResolvedValue(profile()), getBalance: jest.fn().mockResolvedValue(null),
            findCategories: jest.fn(async (c: string[]) => c.filter((x) => ['rust', 'fe', 'tests', 'scripts'].includes(x))),
            findSellers: jest.fn(async (a: string[]) => a.filter((x) => x.endsWith('.testnet'))), setAccountIds: jest.fn(),
        } as unknown as jest.Mocked<MandatesRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-set_mandate-2', explorer_url: '', result: null }),
            createAccount: jest.fn().mockResolvedValue({ account_id: 'agora-new.testnet', agents_account_id: 'agents.agora-new.testnet' }),
        } as unknown as jest.Mocked<ChainService>;
        service = new MandatesService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService, chain);
    });

    it('shows the contract defaults before anything is saved', async () => {
        await expect(service.getMandate('Bearer t')).resolves.toMatchObject({
            perJobCap: 50, dailyCap: 120, newSellerCap: 25, reviewWindowHours: 12, categories: ['rust', 'fe', 'tests'], strict: false, paused: false, saved: false, usedToday: 0,
        });
    });

    it('saves only the changed limits on top of the current ones, as USDC base units', async () => {
        repo.getMandate.mockResolvedValue(profile(saved()));
        await expect(service.editMandate('Bearer t', { daily_cap: 150 } as never)).resolves.toMatchObject({ message: 'Limits Successfully Saved', perJobCap: 40, dailyCap: 150 });
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'lumen.testnet', 'set_mandate', {
            per_job_cap: '40000000', daily_cap: '150000000', new_seller_cap: '20000000', review_timeout_hours: 6, categories: ['rust'], strict: false, approved_sellers: [],
        }, '1']);
    });

    it.each([
        [{ per_job_cap: 200 }, 'above the daily cap'],
        [{ new_seller_cap: 60 }, 'above the per-job cap'],
        [{ categories: [] }, 'at least one category'],
        [{ categories: ['design'] }, 'Unknown category: design'],
        [{ approved_sellers: ['bob.near'] }, 'Not a seller: bob.near'],
        [{}, 'at least one limit'],
    ])('refuses limits that make no sense %#', async (body, msg) => {
        await expect(service.editMandate('Bearer t', body as never)).rejects.toThrow(msg);
        expect(chain.callAs.mock.calls).toHaveLength(0);
    });

    it('pauses with the owner key and only unpauses when paused', async () => {
        await expect(service.pauseAgents('Bearer t')).resolves.toMatchObject({ paused: true });
        expect(chain.callAs.mock.calls[0]).toEqual(['owner', 'lumen.testnet', 'pause', {}]);
        await expect(service.unpauseAgents('Bearer t')).rejects.toThrow('not paused');
        repo.getMandate.mockResolvedValue(profile(saved({ paused: true })));
        await expect(service.pauseAgents('Bearer t')).rejects.toThrow('already paused');
        await expect(service.unpauseAgents('Bearer t')).resolves.toMatchObject({ paused: false });
        expect(chain.callAs.mock.calls[1]).toEqual(['owner', 'lumen.testnet', 'unpause', {}, '1']);
    });
});
