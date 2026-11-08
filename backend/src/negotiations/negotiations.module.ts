import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { NegotiationsController } from './negotiations.controller.js';
import { NegotiationsRepository } from './negotiations.repository.js';
import { NegotiationsService } from './negotiations.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [NegotiationsController],
    providers: [NegotiationsService, NegotiationsRepository, AuthService],
})
export class NegotiationsModule {}
