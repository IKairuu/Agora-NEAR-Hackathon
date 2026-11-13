import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { SupabaseAdminService } from '../auth/supabase-admin.service.js';
import { ChainModule } from '../chain/chain.module.js';
import { SellerProfileController } from './seller-profile.controller.js';
import { SellerProfileRepository } from './seller-profile.repository.js';
import { SellerProfileService } from './seller-profile.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule],
    controllers: [SellerProfileController],
    providers: [SellerProfileService, SellerProfileRepository, AuthService, SupabaseAdminService],
})
export class SellerProfileModule {}
