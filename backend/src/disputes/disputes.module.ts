import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { ChainModule } from '../chain/chain.module.js';
import { DisputesController } from './disputes.controller.js';
import { DisputesRepository } from './disputes.repository.js';
import { DisputesService } from './disputes.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule, AgentsModule],
    controllers: [DisputesController],
    providers: [DisputesService, DisputesRepository, AuthService],
})
export class DisputesModule {}
