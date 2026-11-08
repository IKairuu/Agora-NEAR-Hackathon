import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

jest.mock('../prisma', () => ({ prisma: {} }));

import { InternalKeyGuard } from './internal-key.guard';

const ctx = (key?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: key ? { 'x-internal-key': key } : {} }) }) }) as unknown as ExecutionContext;

describe('InternalKeyGuard', () => {
    beforeAll(() => {
        process.env['AGORA_INTERNAL_KEY'] = 'k'.repeat(32);
    });

    it('accepts the right key and refuses anything else', () => {
        const guard = new InternalKeyGuard();
        expect(guard.canActivate(ctx('k'.repeat(32)))).toBe(true);
        expect(() => guard.canActivate(ctx('wrong'))).toThrow(UnauthorizedException);
        expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
    });
});
