jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { AccountsRepository } from './accounts.repository';
import { AccountsService, initialsOf } from './accounts.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';

describe('AccountsService', () => {
    let repo: jest.Mocked<AccountsRepository>;
    let service: AccountsService;

    beforeEach(() => {
        repo = { getAccount: jest.fn(), editAccount: jest.fn() } as unknown as jest.Mocked<AccountsRepository>;
        const auth = {
            getSessionClaims: jest.fn().mockResolvedValue({ id: USER, email: 'team@lumenlabs.example', name: 'Lumen Labs', avatar: '' }),
        } as unknown as AuthService;
        service = new AccountsService(repo, auth);
    });

    it('creates the profile on first sign-in and returns the ME shape', async () => {
        repo.getAccount.mockResolvedValue({
            id: USER, displayName: 'Lumen Labs', nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet',
            role: 'hire', mode: null, theme: null, location: null, bio: null, sellers: [],
        });
        const me = await service.getAccount('Bearer t');
        expect(repo.getAccount.mock.calls[0]).toEqual([USER, 'Lumen Labs']);
        expect(me).toMatchObject({ name: 'Lumen Labs', acct: 'lumen.testnet', agents: 'agents.lumen.testnet', initials: 'LL', email: 'team@lumenlabs.example', mode: 'buy', seller: false });
    });

    it('refuses an empty edit', async () => {
        await expect(service.editAccount('Bearer t', {} as never)).rejects.toThrow('at least one field');
    });

    it('edits the caller only', async () => {
        repo.getAccount.mockResolvedValue({ id: USER } as never);
        repo.editAccount.mockResolvedValue({ id: USER });
        await expect(service.editAccount('Bearer t', { role: 'work' } as never)).resolves.toEqual({ message: 'Account Successfully Edited', id: USER });
        expect(repo.editAccount.mock.calls[0]?.[0]).toBe(USER);
    });

    it('builds initials from names and emails', () => {
        expect(initialsOf('Dana Okafor')).toBe('DO');
        expect(initialsOf('patchsmith')).toBe('PA');
        expect(initialsOf('kofi.mensah@example.com')).toBe('KM');
    });
});
