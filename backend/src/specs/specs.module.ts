import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { SpecsController } from './specs.controller.js';
import { SpecsRepository } from './specs.repository.js';
import { SpecsService } from './specs.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [SpecsController],
    providers: [SpecsService, SpecsRepository, AuthService],
})
export class SpecsModule {}
