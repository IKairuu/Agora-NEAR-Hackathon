import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { SupabaseAdminService } from '../auth/supabase-admin.service.js';
import { ChainModule } from '../chain/chain.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletRepository } from './wallet.repository.js';
import { WalletService } from './wallet.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule],
    controllers: [WalletController],
    providers: [WalletService, WalletRepository, AuthService, SupabaseAdminService],
})
export class WalletModule {}
