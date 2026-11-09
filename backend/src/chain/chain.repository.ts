import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

@Injectable()
export class ChainRepository {
    async getVaultSecret(name: string): Promise<string | null> {
        try {
            const rows = await prisma.$queryRaw<{ secret: string | null }[]>`select decrypted_secret as secret from vault.decrypted_secrets where name = ${name} limit 1`;
            return rows[0]?.secret ?? null;
        } catch {
            return null;
        }
    }
}
