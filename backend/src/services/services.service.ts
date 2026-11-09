import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { initialsOf } from '../accounts/accounts.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CreateService } from './dto/CreateService.dto.js';
import { CreateServiceBulk } from './dto/CreateServiceBulk.dto.js';
import { EditService } from './dto/EditService.dto.js';
import { GigRow, SellerStats, ServiceData, ServicesRepository } from './services.repository.js';

export const CATEGORY_LABELS: Record<string, string> = {
    rust: 'Smart contracts',
    fe: 'Front-end',
    tests: 'Tests',
    scripts: 'Scripts',
};

export const categorySlug = (value: string | undefined): string | undefined => {
    const v = (value ?? '').trim().toLowerCase();
    if (!v || v === 'all') return undefined;
    if (CATEGORY_LABELS[v]) return v;
    const slug = Object.keys(CATEGORY_LABELS).find((k) => CATEGORY_LABELS[k]!.toLowerCase() === v);
    if (!slug) throw new BadRequestException('Invalid category');
    return slug;
};

export const levelOf = (level: string | null | undefined, settled: number): string => level ?? (settled < 3 ? 'New seller' : 'Level 1');

export const toGig = (row: GigRow, stats: SellerStats) => {
    const settled = stats.settled.get(row.seller.nearAccountId) ?? 0;
    const profile = row.seller.sellerProfile;
    return {
        id: row.id,
        thumb: row.thumb,
        tone: row.tone,
        seller: row.seller.displayName,
        sellerKey: row.seller.nearAccountId,
        initials: profile?.initials ?? initialsOf(row.seller.displayName),
        kind: row.seller.kind,
        level: levelOf(profile?.level, settled),
        title: row.title,
        rating: stats.rating.get(row.seller.nearAccountId) ?? 0,
        count: settled,
        from: Number(row.fromPrice),
        days: row.days,
        cat: CATEGORY_LABELS[row.category] ?? row.category,
        online: profile?.online ?? false,
        prompt: row.prompt,
    };
};

@Injectable()
export class ServicesService {
    constructor(
        private readonly servicesRepository: ServicesRepository,
        private readonly authService: AuthService,
    ) {}

    async getServices(cat?: string, q?: string) {
        const rows = await this.servicesRepository.getServices({ category: categorySlug(cat), q: q?.trim().slice(0, 100) || undefined });
        return this.toGigs(rows);
    }

    async getService(id: string) {
        if (!isUUID(id)) throw new BadRequestException('Service id must be a valid id');
        const row = await this.servicesRepository.getService(id);
        if (!row) throw new NotFoundException('Service not found');
        const [gig] = await this.toGigs([row]);
        return gig;
    }

    async getOwnServices(token: string) {
        const authId = await this.authId(token);
        return this.toGigs(await this.servicesRepository.getOwnServices(authId));
    }

    async createService(token: string, body: CreateService) {
        const [row] = await this.create(token, [body]);
        return { message: 'Service Successfully Created', id: row!.id };
    }

    async createServices(token: string, body: CreateServiceBulk) {
        const rows = await this.create(token, body.items);
        return { message: 'Services Successfully Created', ids: rows.map((r) => r.id) };
    }

    async editService(token: string, body: EditService) {
        const authId = await this.authId(token);
        const result = await this.servicesRepository.editService(authId, body.id, this.toData(body));
        if (result.count === 0) throw new NotFoundException('Service not found');
        return { message: 'Service Successfully Updated', id: body.id };
    }

    async deleteService(token: string, id: string) {
        const authId = await this.authId(token);
        if (!isUUID(id)) throw new BadRequestException('Service id must be a valid id');
        const result = await this.servicesRepository.deleteService(authId, id);
        if (result.count === 0) throw new NotFoundException('Service not found');
        return { message: 'Service Successfully Deleted', id };
    }

    private async create(token: string, items: CreateService[]) {
        const authId = await this.authId(token);
        const seller = await this.servicesRepository.getOwnSeller(authId);
        if (!seller) throw new BadRequestException('Publish your seller profile first');
        return this.servicesRepository.createServices(authId, seller.id, items.map((i) => this.toData(i)));
    }

    private toData(body: CreateService): ServiceData {
        const category = categorySlug(body.category);
        if (!category) throw new BadRequestException('Invalid category');
        return {
            title: body.title.trim(),
            thumb: body.thumb,
            tone: body.tone,
            category,
            fromPrice: body.from_price,
            days: body.days,
            prompt: body.prompt.trim(),
            active: body.active ?? true,
        };
    }

    private async toGigs(rows: GigRow[]) {
        const stats = await this.servicesRepository.getStats([...new Set(rows.map((r) => r.seller.nearAccountId))]);
        return rows.map((r) => toGig(r, stats));
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }
}
