import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { ServicesController } from './services.controller.js';
import { ServicesRepository } from './services.repository.js';
import { ServicesService } from './services.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [ServicesController],
    providers: [ServicesService, ServicesRepository, AuthService],
})
export class ServicesModule {}
