import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { ChainModule } from '../chain/chain.module.js';
import { IndexerModule } from '../indexer/indexer.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule, IndexerModule],
    controllers: [PaymentsController],
    providers: [PaymentsService, PaymentsRepository, AuthService],
})
export class PaymentsModule {}
