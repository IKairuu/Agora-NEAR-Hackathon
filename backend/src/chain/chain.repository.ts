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

    /**
     * Saves a secret in Supabase Vault under a unique name. If the name is already taken the stored secret wins
     * and is returned, so a retry after a half-finished setup reuses the same key instead of making a second one.
     */
    async putVaultSecret(name: string, secret: string, description: string): Promise<string> {
        const existing = await this.getVaultSecret(name);
        if (existing) return existing;
        await prisma.$queryRaw`select vault.create_secret(${secret}, ${name}, ${description})`;
        return (await this.getVaultSecret(name)) ?? secret;
    }
}
