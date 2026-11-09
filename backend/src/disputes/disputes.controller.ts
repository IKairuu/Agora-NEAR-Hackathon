import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { DisputesService } from './disputes.service.js';
import { CreateDispute } from './dto/CreateDispute.dto.js';
import { EscalateDispute } from './dto/EscalateDispute.dto.js';
import { RuleDispute } from './dto/RuleDispute.dto.js';

@Controller('disputes')
export class DisputesController {
    constructor(private readonly disputesService: DisputesService) {}

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createDispute(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateDispute) {
        return this.disputesService.createDispute(auth, body);
    }

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getDispute(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.disputesService.getDispute(auth, job);
    }

    @Get('v1/treasury')
    @HttpCode(200)
    getTreasury() {
        return this.disputesService.getTreasury();
    }

    @Post('v1/:id/escalate')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    escalateDispute(@Headers('authorization') auth: string, @Param('id') id: string, @Body(ValidationPipe) body: EscalateDispute) {
        return this.disputesService.escalateDispute(auth, id, body);
    }

    @Post('v1/:id/rule')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    ruleDispute(@Headers('authorization') auth: string, @Param('id') id: string, @Body(ValidationPipe) body: RuleDispute) {
        return this.disputesService.ruleDispute(auth, id, body);
    }

    @Post('v1/:id/finalize')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    finalizeDispute(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.disputesService.finalizeDispute(auth, id);
    }
}
