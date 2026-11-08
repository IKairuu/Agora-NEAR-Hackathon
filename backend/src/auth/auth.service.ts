import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { constants } from './constants.js';

@Injectable()
export class AuthService {
    private readonly jwks = constants.supabaseUrl
        ? createRemoteJWKSet(new URL(`${constants.supabaseUrl}/auth/v1/.well-known/jwks.json`))
        : null;

    async verifySessionToken(token: string): Promise<string> {
        const payload = await this.verify(token);
        if (!payload.sub) throw new UnauthorizedException('Session token has no user');
        return payload.sub;
    }

    private async verify(token: string): Promise<JWTPayload> {
        if (!token) throw new UnauthorizedException('Sign in first');
        const options = {
            audience: constants.audience,
            issuer: constants.supabaseUrl ? `${constants.supabaseUrl}/auth/v1` : undefined,
        };
        try {
            const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')) as { alg?: string };
            if (header.alg === 'HS256') {
                if (!constants.secret) throw new Error('SUPABASE_JWT_SECRET is not set');
                return (await jwtVerify(token, new TextEncoder().encode(constants.secret), { ...options, algorithms: ['HS256'] })).payload;
            }
            if (!this.jwks) throw new Error('SUPABASE_URL is not set');
            return (await jwtVerify(token, this.jwks, { ...options, algorithms: ['ES256', 'RS256'] })).payload;
        } catch {
            throw new UnauthorizedException('Your session has expired. Sign in again.');
        }
    }
}
