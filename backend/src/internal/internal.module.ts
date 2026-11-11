import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { ChainModule } from '../chain/chain.module.js';
import { IndexerModule } from '../indexer/indexer.module.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { InternalKeyGuard } from './internal-key.guard.js';
import { AgentNotifyAliasController, InternalController } from './internal.controller.js';
import { InternalRepository } from './internal.repository.js';
import { InternalService } from './internal.service.js';

@Module({
    imports: [IndexerModule, ChainModule, AgentsModule, ReviewsModule],
    controllers: [InternalController, AgentNotifyAliasController],
    providers: [InternalService, InternalRepository, InternalKeyGuard],
})
export class InternalModule {}
