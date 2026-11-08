import { Controller, Get, Headers, HttpCode, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { AgentsService } from './agents.service.js';

@Controller('agents')
export class AgentsController {
    constructor(private readonly agentsService: AgentsService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getAgents(@Headers('authorization') auth: string) {
        return this.agentsService.getAgents(auth);
    }

    @Get('v1/events')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getEvents(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.agentsService.getEvents(auth, job);
    }
}
