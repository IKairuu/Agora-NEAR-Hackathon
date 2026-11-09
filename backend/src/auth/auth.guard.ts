import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private readonly authService: AuthService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const header = request.headers['authorization'] ?? '';
        if (!header.startsWith('Bearer ')) throw new UnauthorizedException('Sign in first');
        await this.authService.verifySessionToken(header.replace('Bearer ', ''));
        return true;
    }
}
