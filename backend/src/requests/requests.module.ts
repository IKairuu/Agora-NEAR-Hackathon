import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { AgentsModule } from '../agents/agents.module.js';
import { RequestsController } from './requests.controller.js';
import { RequestsRepository } from './requests.repository.js';
import { RequestsService } from './requests.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, AgentsModule],
    controllers: [RequestsController],
    providers: [RequestsService, RequestsRepository, AuthService],
})
export class RequestsModule {}
