import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateSaved } from './dto/CreateSaved.dto.js';
import { CreateSavedBulk } from './dto/CreateSavedBulk.dto.js';
import { SavedService } from './saved.service.js';

@Controller('saved')
export class SavedController {
    constructor(private readonly savedService: SavedService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getSaved(@Headers('authorization') auth: string) {
        return this.savedService.getSaved(auth);
    }

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createSaved(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateSaved) {
        return this.savedService.createSaved(auth, body);
    }

    @Post('v1/bulk-create')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createSavedBulk(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateSavedBulk) {
        return this.savedService.createSavedBulk(auth, body);
    }

    @Delete('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    deleteSaved(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.savedService.deleteSaved(auth, id);
    }
}
