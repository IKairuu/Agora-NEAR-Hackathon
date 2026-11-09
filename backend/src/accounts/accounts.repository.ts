import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';
import { EditAccount } from './dto/EditAccount.dto.js';

const accountSelect = {
    id: true,
    displayName: true,
    nearAccountId: true,
    agentsAccountId: true,
    role: true,
    mode: true,
    theme: true,
    location: true,
    bio: true,
    sellers: { select: { id: true }, take: 1 },
} satisfies Prisma.ProfileSelect;

export type AccountRow = Prisma.ProfileGetPayload<{ select: typeof accountSelect }>;

@Injectable()
export class AccountsRepository {
    async getAccount(userId: string, displayName: string) {
        return prisma.$transaction(async (tx) =>
            tx.profile.upsert({
                where: { id: userId },
                create: { id: userId, displayName },
                update: {},
                select: accountSelect,
            }),
        );
    }

    async editAccount(userId: string, body: EditAccount) {
        return prisma.$transaction(async (tx) =>
            tx.profile.update({
                where: { id: userId },
                data: {
                    displayName: body.display_name,
                    role: body.role,
                    mode: body.mode,
                    theme: body.theme,
                    location: body.location,
                    bio: body.bio,
                },
                select: { id: true },
            }),
        );
    }
}
