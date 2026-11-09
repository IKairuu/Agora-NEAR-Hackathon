import { Controller, Get, HttpCode, Param, Query } from '@nestjs/common';
import { SellersService } from './sellers.service.js';

@Controller('sellers')
export class SellersController {
    constructor(private readonly sellersService: SellersService) {}

    @Get('v1')
    @HttpCode(200)
    getSellers(@Query('q') q: string, @Query('kind') kind: string) {
        return this.sellersService.getSellers(q, kind);
    }

    @Get('v1/:id')
    @HttpCode(200)
    getSeller(@Param('id') id: string) {
        return this.sellersService.getSeller(id);
    }
}
