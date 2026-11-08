import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { ChainModule } from '../chain/chain.module.js';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesRepository } from './deliveries.repository.js';
import { DeliveriesService } from './deliveries.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule],
    controllers: [DeliveriesController],
    providers: [DeliveriesService, DeliveriesRepository, AuthService],
})
export class DeliveriesModule {}
