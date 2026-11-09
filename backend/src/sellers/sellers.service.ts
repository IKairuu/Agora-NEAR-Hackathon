import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { initialsOf } from '../accounts/accounts.service.js';
import { PartyKind } from '../generated/prisma/client.js';
import { levelOf } from '../services/services.service.js';
import { ReputationStats, SellerDirRow, SellersRepository } from './sellers.repository.js';

const ACCOUNT = /^[a-z0-9._-]{2,64}$/;

export const toSellerDir = (row: SellerDirRow, stats: ReputationStats) => {
    const rep = stats.reputation.get(row.nearAccountId);
    const settled = rep?.settledJobs ?? 0;
    const profile = row.sellerProfile;
    const prices = row.services.map((s) => Number(s.fromPrice));
    const days = row.services.map((s) => s.days);
    return {
        key: row.nearAccountId,
        id: row.id,
        name: row.displayName,
        initials: profile?.initials ?? initialsOf(row.displayName),
        kind: row.kind,
        level: levelOf(profile?.level, settled),
        rating: stats.rating.get(row.nearAccountId) ?? 0,
        settled,
        buyers: rep?.distinctBuyers ?? 0,
        pass: rep?.firstTryPassRate === null || rep?.firstTryPassRate === undefined ? 0 : Math.round(Number(rep.firstTryPassRate)),
        volume: rep ? Number(rep.settledVolume) : 0,
        from: prices.length ? Math.min(...prices) : row.priceFloor === null ? 0 : Number(row.priceFloor),
        acct: row.nearAccountId,
        about: profile?.about ?? row.headline ?? '',
        langs: profile?.langs.length ? profile.langs.join(', ') : 'English',
        online: profile?.online ?? false,
        gig: row.services[0]?.id ?? '',
        days: days.length ? Math.min(...days) : profile?.days ?? 1,
    };
};

@Injectable()
export class SellersService {
    constructor(private readonly sellersRepository: SellersRepository) {}

    async getSellers(q?: string, kind?: string) {
        if (kind && !Object.values(PartyKind).includes(kind as PartyKind)) throw new BadRequestException('Invalid seller kind');
        const rows = await this.sellersRepository.getSellers({ kind: (kind as PartyKind) || undefined, q: q?.trim().slice(0, 100) || undefined });
        const stats = await this.sellersRepository.getStats(rows.map((r) => r.nearAccountId));
        return rows.map((r) => toSellerDir(r, stats));
    }

    async getSeller(id: string) {
        const key = isUUID(id) ? { id } : ACCOUNT.test((id ?? '').toLowerCase()) ? { nearAccountId: id.toLowerCase() } : null;
        if (!key) throw new BadRequestException('Seller id must be a valid id or NEAR account');
        const row = await this.sellersRepository.getSeller(key);
        if (!row) throw new NotFoundException('Seller not found');
        const stats = await this.sellersRepository.getStats([row.nearAccountId]);
        return toSellerDir(row, stats);
    }
}
