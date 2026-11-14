jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { AccountsRepository } from './accounts.repository';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AccountsService, initialsOf } from './accounts.service';
import { EditAccount } from './dto/EditAccount.dto';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';

describe('AccountsService', () => {
    let repo: jest.Mocked<AccountsRepository>;
    let service: AccountsService;

    beforeEach(() => {
        repo = { getAccount: jest.fn(), editAccount: jest.fn(), getAvatar: jest.fn() } as unknown as jest.Mocked<AccountsRepository>;
        const auth = {
            getSessionClaims: jest.fn().mockResolvedValue({ id: USER, email: 'team@lumenlabs.example', name: 'Lumen Labs', avatar: '' }),
        } as unknown as AuthService;
        service = new AccountsService(repo, auth);
    });

    it('creates the profile on first sign-in and returns the ME shape', async () => {
        repo.getAccount.mockResolvedValue({
            id: USER, displayName: 'Lumen Labs', nearAccountId: 'lumen.testnet', agentsAccountId: 'agents.lumen.testnet',
            role: 'hire', mode: null, theme: null, location: null, bio: null, avatarUpdatedAt: null, sellers: [],
        });
        const me = await service.getAccount('Bearer t');
        expect(repo.getAccount.mock.calls[0]).toEqual([USER, 'Lumen Labs']);
        expect(me).toMatchObject({ name: 'Lumen Labs', acct: 'lumen.testnet', agents: 'agents.lumen.testnet', initials: 'LL', email: 'team@lumenlabs.example', mode: 'buy', seller: false, photo: '' });
    });

    it('returns the photo URL, versioned by when it changed', async () => {
        const at = new Date('2026-11-14T01:00:00Z');
        repo.getAccount.mockResolvedValue({
            id: USER, displayName: 'Lumen Labs', nearAccountId: null, agentsAccountId: null,
            role: null, mode: null, theme: null, location: null, bio: null, avatarUpdatedAt: at, sellers: [],
        });
        await expect(service.getAccount('Bearer t')).resolves.toMatchObject({ photo: `/api/avatars/v1/${USER}?v=${at.getTime()}` });
    });

    it('serves a stored photo as image bytes', async () => {
        repo.getAvatar.mockResolvedValue('data:image/jpeg;base64,/9j/AA==');
        const photo = await service.getAvatar(USER);
        expect(photo.type).toBe('image/jpeg');
        expect([...photo.body]).toEqual([0xff, 0xd8, 0xff, 0x00]);
    });

    it('answers 404 when there is no photo or the id is not an account id', async () => {
        repo.getAvatar.mockResolvedValue(null);
        await expect(service.getAvatar(USER)).rejects.toThrow('No photo');
        await expect(service.getAvatar('../etc')).rejects.toThrow('No photo');
        expect(repo.getAvatar).toHaveBeenCalledTimes(1);
    });

    it('accepts only small JPEG, PNG or WebP data URLs, or "" to remove', async () => {
        const errs = async (avatar: string) => (await validate(plainToInstance(EditAccount, { avatar }))).length;
        expect(await errs('data:image/jpeg;base64,/9j/AA==')).toBe(0);
        expect(await errs('data:image/webp;base64,UklGRg==')).toBe(0);
        expect(await errs('')).toBe(0);
        expect(await errs('data:image/svg+xml;base64,PHN2Zz4=')).toBe(1);
        expect(await errs('https://example.com/me.png')).toBe(1);
        expect(await errs('data:image/png;base64,' + 'A'.repeat(100_000))).toBe(1);
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
