import { Injectable } from '@nestjs/common';
import { PartyKind, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';
import { EditSellerProfile } from './dto/EditSellerProfile.dto.js';

const profileSelect = {
    id: true,
    step: true,
    sellerId: true,
    displayName: true,
    initials: true,
    country: true,
    about: true,
    langs: true,
    experience: true,
    githubUsername: true,
    skills: true,
    categories: true,
    priceFrom: true,
    days: true,
    headline: true,
    coder: true,
    agentName: true,
    agentModel: true,
    maxJobs: true,
    deliveryTerms: true,
    payoutChain: true,
    payoutAddress: true,
    level: true,
    online: true,
    publishedAt: true,
    user: { select: { nearAccountId: true, agentsAccountId: true } },
} satisfies Prisma.SellerProfileSelect;

export type SellerProfileRow = Prisma.SellerProfileGetPayload<{ select: typeof profileSelect }>;

export interface SellerData {
    kind: PartyKind;
    nearAccountId: string;
    displayName: string;
    headline: string | null;
    skills: string[];
    categories: string[];
    priceFloor: Prisma.Decimal | null;
    maxConcurrentJobs: number;
    deliveryTerms: string | null;
    payoutChain: string;
    payoutAddress: string;
}

const toData = (body: EditSellerProfile) => ({
    step: body.step,
    displayName: body.display_name,
    initials: body.initials,
    country: body.country,
    about: body.about,
    langs: body.langs,
    experience: body.experience === undefined ? undefined : (JSON.parse(JSON.stringify(body.experience)) as Prisma.InputJsonValue),
    githubUsername: body.github_username,
    skills: body.skills,
    categories: body.categories,
    priceFrom: body.price_from,
    days: body.days,
    headline: body.headline,
    coder: body.coder,
    agentName: body.agent_name,
    agentModel: body.agent_model,
    maxJobs: body.max_jobs,
    deliveryTerms: body.delivery_terms,
    payoutChain: body.payout_chain,
    payoutAddress: body.payout_address,
    online: body.online,
});

@Injectable()
export class SellerProfileRepository {
    async getProfile(userId: string) {
        return prisma.sellerProfile.findUnique({ where: { userId }, select: profileSelect });
    }

    async findCategories(slugs: string[]) {
        const rows = await prisma.category.findMany({ where: { slug: { in: slugs }, enabled: true }, select: { slug: true } });
        return rows.map((r) => r.slug);
    }

    async saveProfile(userId: string, displayName: string, body: EditSellerProfile) {
        return prisma.$transaction(async (tx) => {
            await tx.profile.upsert({ where: { id: userId }, create: { id: userId, displayName }, update: {}, select: { id: true } });
            const data = toData(body);
            return tx.sellerProfile.upsert({
                where: { userId },
                create: { userId, ...data },
                update: data,
                select: { id: true, step: true },
            });
        });
    }

    async setAccountIds(userId: string, nearAccountId: string, agentsAccountId: string) {
        return prisma.$transaction(async (tx) =>
            tx.profile.update({ where: { id: userId }, data: { nearAccountId, agentsAccountId }, select: { id: true } }),
        );
    }

    async getSellerAccount(userId: string) {
        const profile = await prisma.sellerProfile.findUnique({ where: { userId }, select: { sellerId: true } });
        return prisma.seller.findFirst({
            where: { ownerId: userId, ...(profile?.sellerId ? { id: profile.sellerId } : {}) },
            select: { id: true, nearAccountId: true, stake: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    async publish(userId: string, profileId: string, sellerId: string | null, data: SellerData) {
        return prisma.$transaction(async (tx) => {
            const seller = sellerId
                ? await tx.seller.update({ where: { id: sellerId, ownerId: userId }, data, select: { id: true, nearAccountId: true } })
                : await tx.seller.create({ data: { ownerId: userId, ...data }, select: { id: true, nearAccountId: true } });
            await tx.sellerProfile.update({
                where: { id: profileId, userId },
                data: { sellerId: seller.id, step: 5, publishedAt: new Date() },
                select: { id: true },
            });
            return seller;
        });
    }
}
