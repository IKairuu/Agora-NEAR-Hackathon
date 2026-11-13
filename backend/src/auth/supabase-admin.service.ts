import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { constants } from './constants.js';

export const walletEmail = (accountId: string): string => `${accountId}@${process.env['AGORA_WALLET_EMAIL_DOMAIN'] || 'wallet.agora.invalid'}`;

@Injectable()
export class SupabaseAdminService {
    private client: SupabaseClient | null = null;

    async getUserEmail(userId: string): Promise<string | null> {
        const { data, error } = await this.admin().auth.admin.getUserById(userId);
        if (error || !data.user) return null;
        return data.user.email ?? null;
    }

    async createWalletUser(accountId: string): Promise<{ id: string; email: string }> {
        const email = walletEmail(accountId);
        const { data, error } = await this.admin().auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { name: accountId, near_account_id: accountId, agora_onboarding: { wallet: true } },
        });
        if (error || !data.user) throw new BadRequestException(`Could not create an account for ${accountId}: ${error?.message ?? 'unknown error'}`);
        return { id: data.user.id, email };
    }

    /** The GitHub login linked to this AGORA account in Supabase Auth, or null. Read on the server, so a client cannot claim someone else's GitHub. */
    async getGithubLogin(userId: string): Promise<string | null> {
        const { data, error } = await this.admin().auth.admin.getUserById(userId);
        if (error || !data.user) return null;
        const gh = (data.user.identities ?? []).find((i) => i.provider === 'github');
        const d = (gh?.identity_data ?? {}) as Record<string, unknown>;
        const login = d['user_name'] ?? d['preferred_username'];
        return typeof login === 'string' && login ? login : null;
    }

    async signInTokenFor(email: string): Promise<string> {
        const { data, error } = await this.admin().auth.admin.generateLink({ type: 'magiclink', email });
        const token = data?.properties?.hashed_token;
        if (error || !token) throw new BadRequestException(`Could not start the session: ${error?.message ?? 'no token'}`);
        return token;
    }

    private admin(): SupabaseClient {
        if (this.client) return this.client;
        const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
        if (!constants.supabaseUrl || !key) throw new ServiceUnavailableException('Wallet sign-in needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server');
        this.client = createClient(constants.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
        return this.client;
    }
}
