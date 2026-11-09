import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class InternalKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const expected = process.env['AGORA_INTERNAL_KEY'] ?? '';
        const given = context.switchToHttp().getRequest<Request>().headers['x-internal-key'];
        if (expected.length < 16 || typeof given !== 'string') throw new UnauthorizedException('Invalid internal key');
        const a = Buffer.from(given);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid internal key');
        return true;
    }
}
