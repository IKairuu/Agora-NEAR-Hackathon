import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';

const SECRET = 'test-secret-that-is-long-enough-for-hs256';
const URL_BASE = 'https://example.supabase.co';

process.env['SUPABASE_JWT_SECRET'] = SECRET;
process.env['SUPABASE_URL'] = URL_BASE;

const sign = (claims: Record<string, unknown>, secret = SECRET, expires = '1h') =>
    new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(`${URL_BASE}/auth/v1`)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime(expires)
        .sign(new TextEncoder().encode(secret));

describe('AuthService', () => {
    let service: import('./auth.service.js').AuthService;

    beforeAll(async () => {
        const { AuthService } = await import('./auth.service.js');
        service = new AuthService();
    });

    it('returns the user id from a valid Supabase token', async () => {
        const token = await sign({ sub: '7b0c2a52-8f61-4a7e-9d3f-2c1e5b6a9f10' });
        await expect(service.verifySessionToken(token)).resolves.toBe('7b0c2a52-8f61-4a7e-9d3f-2c1e5b6a9f10');
    });

    it('rejects an empty token', async () => {
        await expect(service.verifySessionToken('')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token signed with another secret', async () => {
        const token = await sign({ sub: 'someone' }, 'a-different-secret-that-is-long-enough');
        await expect(service.verifySessionToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
        const token = await sign({ sub: 'someone' }, SECRET, '-1m');
        await expect(service.verifySessionToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token without a user', async () => {
        const token = await sign({});
        await expect(service.verifySessionToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
