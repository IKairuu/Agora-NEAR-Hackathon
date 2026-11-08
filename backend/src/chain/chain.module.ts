import { Module } from '@nestjs/common';
import { IndexerModule } from '../indexer/indexer.module.js';
import { ChainService } from './chain.service';

@Module({
    imports: [IndexerModule],
    providers: [ChainService],
    exports: [ChainService],
})
export class ChainModule {}
