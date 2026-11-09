import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateNegotiation } from './dto/CreateNegotiation.dto.js';
import { CreateNegotiationBulk } from './dto/CreateNegotiationBulk.dto.js';
import { HireSeller } from './dto/HireSeller.dto.js';
import { NegotiationsService } from './negotiations.service.js';

@Controller('negotiations')
export class NegotiationsController {
    constructor(private readonly negotiationsService: NegotiationsService) {}

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createNegotiation(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateNegotiation) {
        return this.negotiationsService.createNegotiation(auth, body);
    }

    @Post('v1/bulk-create')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createNegotiations(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateNegotiationBulk) {
        return this.negotiationsService.createNegotiations(auth, body);
    }

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getNegotiations(@Headers('authorization') auth: string, @Query('bid') bid: string) {
        return this.negotiationsService.getNegotiations(auth, bid);
    }

    @Post('v1/hire')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    hireSeller(@Headers('authorization') auth: string, @Body(ValidationPipe) body: HireSeller) {
        return this.negotiationsService.hireSeller(auth, body);
    }

    @Get('v1/offer')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getOffer(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.negotiationsService.getOffer(auth, job);
    }

    @Post('v1/:id/accept')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    acceptOffer(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.negotiationsService.acceptOffer(auth, id);
    }

    @Post('v1/:id/decline')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    declineOffer(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.negotiationsService.declineOffer(auth, id);
    }
}
