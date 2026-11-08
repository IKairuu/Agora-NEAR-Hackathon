import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [OrdersController],
    providers: [OrdersService, OrdersRepository, AuthService],
})
export class OrdersModule {}
