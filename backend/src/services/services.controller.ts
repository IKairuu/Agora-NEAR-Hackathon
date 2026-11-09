import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateService } from './dto/CreateService.dto.js';
import { CreateServiceBulk } from './dto/CreateServiceBulk.dto.js';
import { EditService } from './dto/EditService.dto.js';
import { ServicesService } from './services.service.js';

@Controller('services')
export class ServicesController {
    constructor(private readonly servicesService: ServicesService) {}

    @Get('v1')
    @HttpCode(200)
    getServices(@Query('cat') cat: string, @Query('q') q: string) {
        return this.servicesService.getServices(cat, q);
    }

    @Get('v1/mine')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getOwnServices(@Headers('authorization') auth: string) {
        return this.servicesService.getOwnServices(auth);
    }

    @Get('v1/:id')
    @HttpCode(200)
    getService(@Param('id') id: string) {
        return this.servicesService.getService(id);
    }

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createService(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateService) {
        return this.servicesService.createService(auth, body);
    }

    @Post('v1/bulk-create')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createServices(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateServiceBulk) {
        return this.servicesService.createServices(auth, body);
    }

    @Patch('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    editService(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditService) {
        return this.servicesService.editService(auth, body);
    }

    @Delete('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    deleteService(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.servicesService.deleteService(auth, id);
    }
}
