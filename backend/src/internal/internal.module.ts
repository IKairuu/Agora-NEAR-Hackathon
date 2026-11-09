import { Module } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module.js';
import { IndexerModule } from '../indexer/indexer.module.js';
import { InternalKeyGuard } from './internal-key.guard.js';
import { InternalController } from './internal.controller.js';
import { InternalRepository } from './internal.repository.js';
import { InternalService } from './internal.service.js';

@Module({
    imports: [IndexerModule, ChainModule],
    controllers: [InternalController],
    providers: [InternalService, InternalRepository, InternalKeyGuard],
})
export class InternalModule {}
