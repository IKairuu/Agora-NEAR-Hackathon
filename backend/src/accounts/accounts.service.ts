import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { AccountRow, AccountsRepository } from './accounts.repository.js';
import { EditAccount } from './dto/EditAccount.dto.js';

export const initialsOf = (name: string): string => {
    const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
    const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
};

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
}
