import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { SellersController } from './sellers.controller.js';
import { SellersRepository } from './sellers.repository.js';
import { SellersService } from './sellers.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [SellersController],
    providers: [SellersService, SellersRepository, AuthService],
})
export class SellersModule {}
