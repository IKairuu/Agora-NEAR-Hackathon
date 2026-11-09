import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { ChainModule } from '../chain/chain.module.js';
import { ReputationController } from './reputation.controller.js';
import { ReputationRepository } from './reputation.repository.js';
import { ReputationService } from './reputation.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule],
    controllers: [ReputationController],
    providers: [ReputationService, ReputationRepository, AuthService],
})
export class ReputationModule {}
