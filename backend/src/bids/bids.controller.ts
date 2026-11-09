import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { BidsService } from './bids.service.js';
import { CreateBid } from './dto/CreateBid.dto.js';
import { CreateBidBulk } from './dto/CreateBidBulk.dto.js';
import { EditBid } from './dto/EditBid.dto.js';
import { ExplainBid } from './dto/ExplainBid.dto.js';

@Controller('bids')
export class BidsController {
    constructor(private readonly bidsService: BidsService) {}

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createBid(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateBid) {
        return this.bidsService.createBid(auth, body);
    }

    @Post('v1/bulk-create')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createBids(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateBidBulk) {
        return this.bidsService.createBids(auth, body);
    }

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getBids(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.bidsService.getBids(auth, job);
    }

    @Patch('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    editBid(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditBid) {
        return this.bidsService.editBid(auth, body);
    }

    @Post('v1/:id/explain')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    explainBid(@Headers('authorization') auth: string, @Param('id') id: string, @Body(ValidationPipe) body: ExplainBid) {
        return this.bidsService.explainBid(auth, id, body);
    }

    @Delete('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    deleteBid(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.bidsService.deleteBid(auth, id);
    }
}
