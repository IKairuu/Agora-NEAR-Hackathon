import { Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getOrders(@Headers('authorization') auth: string) {
        return this.ordersService.getOrders(auth);
    }

    @Post('v1/:id/decline')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    declineRequest(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.ordersService.declineRequest(auth, id);
    }
}
