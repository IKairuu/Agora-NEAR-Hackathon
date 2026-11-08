import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { constants } from './constants.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret })],
    providers: [AuthService, AuthGuard],
    exports: [AuthService, AuthGuard],
})
export class AuthModule {}
