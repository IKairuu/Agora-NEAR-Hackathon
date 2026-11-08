import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateRating } from './dto/CreateRating.dto.js';
import { ReputationService } from './reputation.service.js';

@Controller('reputation')
export class ReputationController {
    constructor(private readonly reputationService: ReputationService) {}

    @Get('v1/ratings')
    @HttpCode(200)
    getRatings(@Query('account') account: string) {
        return this.reputationService.getRatings(account);
    }

    @Post('v1/ratings')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createRating(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateRating) {
        return this.reputationService.createRating(auth, body);
    }

    @Get('v1/:account')
    @HttpCode(200)
    getReputation(@Param('account') account: string) {
        return this.reputationService.getReputation(account);
    }
}
