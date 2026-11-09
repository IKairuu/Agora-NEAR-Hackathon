import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { DeliveriesService } from './deliveries.service.js';
import { CreateDelivery } from './dto/CreateDelivery.dto.js';

@Controller('deliveries')
export class DeliveriesController {
    constructor(private readonly deliveriesService: DeliveriesService) {}

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createDelivery(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateDelivery) {
        return this.deliveriesService.createDelivery(auth, body);
    }

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getDeliveries(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.deliveriesService.getDeliveries(auth, job);
    }

    @Get('v1/:id/proof')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getProof(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.deliveriesService.getProof(auth, id);
    }
}
