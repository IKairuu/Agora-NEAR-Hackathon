import { Module } from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard.js';
import { InternalController } from './internal.controller.js';
import { InternalRepository } from './internal.repository.js';
import { InternalService } from './internal.service.js';

@Module({
    controllers: [InternalController],
    providers: [InternalService, InternalRepository, InternalKeyGuard],
})
export class InternalModule {}
