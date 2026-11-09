import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { AgentsModule } from '../agents/agents.module.js';
import { ChainModule } from '../chain/chain.module.js';
import { BidsController } from './bids.controller.js';
import { BidsRepository } from './bids.repository.js';
import { BidsService } from './bids.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, AgentsModule, ChainModule],
    controllers: [BidsController],
    providers: [BidsService, BidsRepository, AuthService],
})
export class BidsModule {}
