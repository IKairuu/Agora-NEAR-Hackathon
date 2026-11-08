jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { ChainService } from '../chain/chain.service';
import { Prisma } from '../generated/prisma/client';
import { SellerProfileRepository, SellerProfileRow } from './seller-profile.repository';
import { SellerProfileService } from './seller-profile.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const PROFILE = '5b2c7d1e-8f3a-4b6c-9d0e-1a2b3c4d5e6f';
const SELLER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const row = (over: Partial<SellerProfileRow> = {}): SellerProfileRow => ({
    id: PROFILE, step: 4, sellerId: null, displayName: 'Lumen Labs', initials: null, country: 'Philippines', about: 'Rust fixes',
    langs: ['English'], experience: null, githubUsername: null, skills: ['Rust'], categories: ['rust'],
    priceFrom: new Prisma.Decimal(12), days: 2, headline: 'Rust developer', coder: 'me', agentName: null, agentModel: null,
    maxJobs: 3, deliveryTerms: '1 to 2 days', payoutChain: 'near', payoutAddress: null, level: 'New seller', online: false,
    publishedAt: null, user: { nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet' }, ...over,
});

describe('SellerProfileService', () => {
    let repo: jest.Mocked<SellerProfileRepository>;
    let chain: jest.Mocked<ChainService>;
    let service: SellerProfileService;

    beforeEach(() => {
        repo = {
            getProfile: jest.fn(), findCategories: jest.fn(), saveProfile: jest.fn(), setAccountIds: jest.fn(), publish: jest.fn(),
        } as unknown as jest.Mocked<SellerProfileRepository>;
        chain = {
            callAs: jest.fn().mockResolvedValue({ tx_hash: 'mock-register_seller-1', explorer_url: '', result: null }),
            createAccount: jest.fn().mockResolvedValue({ account_id: 'agora-0f9b6c1e.testnet', agents_account_id: 'agents.agora-0f9b6c1e.testnet' }),
            explorerAccountUrl: jest.fn((a: string) => `https://testnet.nearblocks.io/address/${a}`),
        } as unknown as jest.Mocked<ChainService>;
        const auth = {
            getSessionClaims: jest.fn().mockResolvedValue({ id: USER, email: 'team@lumenlabs.example', name: 'Lumen Labs', avatar: '' }),
        } as unknown as AuthService;
        service = new SellerProfileService(repo, auth, chain);
        repo.publish.mockResolvedValue({ id: SELLER, nearAccountId: 'lumen.testnet' });
    });

    it('returns an empty draft before the wizard is started', async () => {
        repo.getProfile.mockResolvedValue(null);
        await expect(service.getProfile('Bearer t')).resolves.toMatchObject({ id: null, step: 0, published: false, name: 'Lumen Labs', initials: 'LL', coder: 'me', payoutChain: 'near' });
    });

    it('returns money as a plain number', async () => {
        repo.getProfile.mockResolvedValue(row());
        await expect(service.getProfile('Bearer t')).resolves.toMatchObject({ priceFrom: 12, maxJobs: 3, acct: 'lumen.testnet' });
    });

    it('refuses unknown categories', async () => {
        repo.findCategories.mockResolvedValue(['rust']);
        await expect(service.editProfile('Bearer t', { step: 3, categories: ['rust', 'cobol'] } as never)).rejects.toThrow('Unknown category: cobol');
        expect(repo.saveProfile.mock.calls).toHaveLength(0);
    });

    it('saves a wizard step for the caller', async () => {
        repo.saveProfile.mockResolvedValue({ id: PROFILE, step: 2 });
        await expect(service.editProfile('Bearer t', { step: 2, about: 'x' } as never)).resolves.toEqual({ message: 'Seller Profile Successfully Saved', id: PROFILE, step: 2 });
        expect(repo.saveProfile.mock.calls[0]?.slice(0, 2)).toEqual([USER, 'Lumen Labs']);
    });

    it('refuses to publish without a profile', async () => {
        repo.getProfile.mockResolvedValue(null);
        await expect(service.publishProfile('Bearer t')).rejects.toThrow('Fill in your seller profile first');
    });

    it.each([
        [{ skills: [] }, 'at least one skill'],
        [{ categories: [] }, 'at least one category'],
        [{ priceFrom: null }, 'minimum price'],
        [{ coder: 'agent', agentName: null }, 'Name your coding agent'],
        [{ payoutChain: 'eth', payoutAddress: '0x8b1F…4e2C' }, '0x address'],
    ])('refuses to publish an incomplete profile %#', async (over, msg) => {
        repo.getProfile.mockResolvedValue(row(over as Partial<SellerProfileRow>));
        await expect(service.publishProfile('Bearer t')).rejects.toThrow(msg);
        expect(repo.publish.mock.calls).toHaveLength(0);
    });

    it('publishes a human seller on the owner account', async () => {
        repo.getProfile.mockResolvedValue(row());
        await expect(service.publishProfile('Bearer t')).resolves.toEqual({
            message: 'Seller Profile Successfully Published', id: SELLER, acct: 'lumen.testnet', explorer: 'https://testnet.nearblocks.io/address/lumen.testnet',
            registered: true, registerTx: 'mock-register_seller-1', registerError: null,
        });
        expect(chain.callAs.mock.calls[0]).toEqual(['platform', 'agora-testnet.testnet', 'register_seller', { account_id: 'lumen.testnet' }, '1']);
        expect(chain.createAccount.mock.calls).toHaveLength(0);
        expect(repo.publish.mock.calls[0]?.slice(0, 3)).toEqual([USER, PROFILE, null]);
        expect(repo.publish.mock.calls[0]?.[3]).toMatchObject({ kind: 'human', nearAccountId: 'lumen.testnet', displayName: 'Lumen Labs', payoutChain: 'near', payoutAddress: 'lumen.testnet', maxConcurrentJobs: 3 });
    });

    it('creates a NEAR account first and puts an agent seller under the agents account', async () => {
        repo.getProfile.mockResolvedValue(row({ coder: 'agent', agentName: 'lumenfix', user: { nearAccountId: null, agentsAccountId: null } }));
        await service.publishProfile('Bearer t');
        expect(chain.createAccount.mock.calls[0]).toEqual([USER]);
        expect(repo.setAccountIds.mock.calls[0]).toEqual([USER, 'agora-0f9b6c1e.testnet', 'agents.agora-0f9b6c1e.testnet']);
        expect(repo.publish.mock.calls[0]?.[3]).toMatchObject({ kind: 'agent', displayName: 'lumenfix', nearAccountId: 'lumenfix.agents.agora-0f9b6c1e.testnet' });
    });

    it('updates the existing seller on republish', async () => {
        repo.getProfile.mockResolvedValue(row({ sellerId: SELLER, payoutChain: 'base', payoutAddress: '0x8b1F000000000000000000000000000000004e2C' }));
        await expect(service.publishProfile('Bearer t')).resolves.toMatchObject({ message: 'Seller Profile Successfully Updated' });
        expect(repo.publish.mock.calls[0]?.[2]).toBe(SELLER);
        expect(repo.publish.mock.calls[0]?.[3]).toMatchObject({ payoutChain: 'base', payoutAddress: '0x8b1F000000000000000000000000000000004e2C' });
    });

    it('turns a taken NEAR account into a readable conflict', async () => {
        repo.getProfile.mockResolvedValue(row());
        repo.publish.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));
        await expect(service.publishProfile('Bearer t')).rejects.toThrow('already used by another seller');
    });

    it('still publishes when the chain refuses to register the seller', async () => {
        repo.getProfile.mockResolvedValue(row());
        chain.callAs.mockRejectedValue(new Error('Paused'));
        await expect(service.publishProfile('Bearer t')).resolves.toMatchObject({ id: SELLER, registered: false, registerError: 'Paused' });
    });
});
