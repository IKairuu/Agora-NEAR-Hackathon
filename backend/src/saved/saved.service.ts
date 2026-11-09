import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { toSellerDir } from '../sellers/sellers.service.js';
import { toGig } from '../services/services.service.js';
import { CreateSaved } from './dto/CreateSaved.dto.js';
import { CreateSavedBulk } from './dto/CreateSavedBulk.dto.js';
import { SavedRepository } from './saved.repository.js';

const ACCOUNT = /^[a-z0-9._-]{2,64}$/;

@Injectable()
export class SavedService {
    constructor(
        private readonly savedRepository: SavedRepository,
        private readonly authService: AuthService,
    ) {}

    async getSaved(token: string) {
        const authId = await this.authId(token);
        const rows = await this.savedRepository.getSaved(authId);
        const accounts = rows.flatMap((r) => [r.service?.seller.nearAccountId, r.seller?.nearAccountId]).filter((a): a is string => Boolean(a));
        const stats = await this.savedRepository.getStats([...new Set(accounts)]);
        const gigStats = { settled: new Map([...stats.reputation].map(([k, v]) => [k, v.settledJobs])), rating: stats.rating };
        const items = rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            targetId: r.serviceId ?? r.sellerId,
            at: r.createdAt,
            gig: r.service && r.service.active ? toGig(r.service, gigStats) : null,
            seller: r.seller ? toSellerDir(r.seller, stats) : null,
        }));
        return {
            items,
            services: items.filter((i) => i.kind === 'service' && i.gig).map((i) => i.targetId),
            sellers: items.filter((i) => i.kind === 'seller' && i.seller).map((i) => i.seller!.key),
        };
    }

    async createSaved(token: string, body: CreateSaved) {
        const authId = await this.authId(token);
        const targetId = await this.target(body);
        const row = await this.savedRepository.createSaved(authId, body.kind, targetId);
        return { message: 'Saved Successfully Created', id: row.id, kind: body.kind, targetId };
    }

    async createSavedBulk(token: string, body: CreateSavedBulk) {
        const authId = await this.authId(token);
        const ids: string[] = [];
        for (const item of body.items) {
            const targetId = await this.target(item);
            ids.push((await this.savedRepository.createSaved(authId, item.kind, targetId)).id);
        }
        return { message: 'Saved Successfully Created', ids };
    }

    async deleteSaved(token: string, id: string) {
        const authId = await this.authId(token);
        let key = id ?? '';
        if (!isUUID(key)) {
            if (!ACCOUNT.test(key.toLowerCase())) throw new BadRequestException('Saved id must be a valid id');
            const seller = await this.savedRepository.findSeller({ nearAccountId: key.toLowerCase() });
            if (!seller) throw new NotFoundException('Saved item not found');
            key = seller.id;
        }
        const result = await this.savedRepository.deleteSaved(authId, key);
        if (result.count === 0) throw new NotFoundException('Saved item not found');
        return { message: 'Saved Successfully Deleted', id };
    }

    private async target(body: CreateSaved): Promise<string> {
        const t = body.target_id.trim();
        if (body.kind === 'service') {
            if (!isUUID(t)) throw new BadRequestException('Service id must be a valid id');
            const service = await this.savedRepository.findService(t);
            if (!service) throw new NotFoundException('Service not found');
            return service.id;
        }
        const key = isUUID(t) ? { id: t } : ACCOUNT.test(t.toLowerCase()) ? { nearAccountId: t.toLowerCase() } : null;
        if (!key) throw new BadRequestException('Seller id must be a valid id or NEAR account');
        const seller = await this.savedRepository.findSeller(key);
        if (!seller) throw new NotFoundException('Seller not found');
        return seller.id;
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }
}
