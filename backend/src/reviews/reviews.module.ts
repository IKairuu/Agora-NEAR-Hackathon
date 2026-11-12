import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { AgentsModule } from '../agents/agents.module.js';
import { ChainModule } from '../chain/chain.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsRepository } from './reviews.repository.js';
import { ReviewsService } from './reviews.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule, AgentsModule],
    controllers: [ReviewsController],
    providers: [ReviewsService, ReviewsRepository, AuthService],
    exports: [ReviewsService],
})
export class ReviewsModule {}
