import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { ChainModule } from '../chain/chain.module.js';
import { MandatesController } from './mandates.controller.js';
import { MandatesRepository } from './mandates.repository.js';
import { MandatesService } from './mandates.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule, ChainModule],
    controllers: [MandatesController],
    providers: [MandatesService, MandatesRepository, AuthService],
})
export class MandatesModule {}
