import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module.js';
import { ChainRepository } from './chain.repository.js';
import { ChainService } from './chain.service.js';

@Module({
    imports: [IndexerModule],
    providers: [ChainService, ChainRepository],
    exports: [ChainService],
})
export class ChainModule {}
