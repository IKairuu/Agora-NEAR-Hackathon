import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { constants } from '../auth/constants.js';
import { JobsController } from './jobs.controller.js';
import { OpenJobsController } from './open-jobs.controller.js';
import { JobsRepository } from './jobs.repository.js';
import { JobsService } from './jobs.service.js';

@Module({
    imports: [JwtModule.register({ secret: constants.secret }), AuthModule],
    controllers: [JobsController, OpenJobsController],
    providers: [JobsService, JobsRepository, AuthService],
})
export class JobsModule {}
