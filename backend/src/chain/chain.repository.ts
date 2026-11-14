import { Injectable } from '@nestjs/common';
import { prisma } from '../prisma.js';

/** chain_txs method name for the platform's one-time NEAR gift that lets a brand-new wallet pay for "Enable agents". */
export const GAS_TOPUP = 'gas_topup';

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

    /** Gas top-ups the platform already sent: one per account ever, and a count for the daily cap. */
    async hasGasTopUp(accountId: string): Promise<boolean> {
        const row = await prisma.chainTx.findFirst({ where: { method: GAS_TOPUP, status: 'success', args: { path: ['account_id'], equals: accountId } }, select: { id: true } });
        return row !== null;
    }

    async countGasTopUpsSince(since: Date): Promise<number> {
        return prisma.chainTx.count({ where: { method: GAS_TOPUP, status: 'success', createdAt: { gte: since } } });
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
