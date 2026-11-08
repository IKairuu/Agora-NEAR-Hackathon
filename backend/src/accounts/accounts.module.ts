import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsRepository } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [AccountsController],
    providers: [AccountsService, AccountsRepository, AuthService],
})
export class AccountsModule {}
