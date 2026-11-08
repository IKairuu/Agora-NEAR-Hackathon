import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard.js';
import { InternalService } from './internal.service.js';

@Controller('internal')
export class InternalController {
    constructor(private readonly internalService: InternalService) {}

    @Post('v1/agents/notify')
    @HttpCode(200)
    @UseGuards(InternalKeyGuard)
    agentNotify(@Body() body: unknown) {
        return this.internalService.agentNotify(body);
    }

    @Post('v1/runner/result')
    @HttpCode(200)
    @UseGuards(InternalKeyGuard)
    runnerResult(@Body() body: unknown) {
        return this.internalService.runnerResult(body);
    }
}
