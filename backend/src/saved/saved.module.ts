import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { SavedController } from './saved.controller.js';
import { SavedRepository } from './saved.repository.js';
import { SavedService } from './saved.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [SavedController],
    providers: [SavedService, SavedRepository, AuthService],
})
export class SavedModule {}
