import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { AccountRow, AccountsRepository } from './accounts.repository.js';
import { EditAccount } from './dto/EditAccount.dto.js';

export const initialsOf = (name: string): string => {
    const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
    const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
};

/** Where a stored profile photo is served; the time busts browser caches when the photo changes. */
export const photoUrl = (id: string, at: Date | null | undefined): string => (at ? `/api/avatars/v1/${id}?v=${at.getTime()}` : '');

export const toMe = (row: AccountRow, email: string, avatar: string) => {
    const name = row.displayName ?? (email || 'You');
    return {
        id: row.id,
        name,
        acct: row.nearAccountId ?? '',
        agents: row.agentsAccountId ?? '',
        initials: initialsOf(name),
        email,
        avatar,
        photo: photoUrl(row.id, row.avatarUpdatedAt),
        role: row.role,
        mode: row.mode ?? 'buy',
        theme: row.theme ?? 'system',
        location: row.location,
        bio: row.bio,
        seller: row.sellers.length > 0,
    };
};

@Injectable()
export class AccountsService {
    constructor(
        private readonly accountsRepository: AccountsRepository,
        private readonly authService: AuthService,
    ) {}

    async getAccount(token: string) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        const row = await this.accountsRepository.getAccount(claims.id, claims.name);
        return toMe(row, claims.email, claims.avatar);
    }

    async editAccount(token: string, body: EditAccount) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        if (Object.values(body).every((v) => v === undefined)) throw new BadRequestException('Send at least one field to change');
        await this.accountsRepository.getAccount(claims.id, claims.name);
        const row = await this.accountsRepository.editAccount(claims.id, body);
        return { message: 'Account Successfully Edited', id: row.id };
    }

    /** A profile photo as bytes, for <img src>. Public: it is shown on seller profiles. */
    async getAvatar(id: string): Promise<{ type: string; body: Buffer }> {
        if (!isUUID(id)) throw new NotFoundException('No photo');
        const data = await this.accountsRepository.getAvatar(id);
        const m = data ? /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(data) : null;
        if (!m) throw new NotFoundException('No photo');
        return { type: m[1]!, body: Buffer.from(m[2]!, 'base64') };
    }
}
