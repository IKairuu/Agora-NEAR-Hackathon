import { Module } from '@nestjs/common';
import { IndexerRepository } from './indexer.repository.js';
import { IndexerService } from './indexer.service.js';

@Module({
    providers: [IndexerService, IndexerRepository],
    exports: [IndexerService, IndexerRepository],
})
export class IndexerModule {}
