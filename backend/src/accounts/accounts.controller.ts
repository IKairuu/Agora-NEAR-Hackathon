import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { AccountsService } from './accounts.service.js';
import { EditAccount } from './dto/EditAccount.dto.js';

@Controller('me')
export class AccountsController {
    constructor(private readonly accountsService: AccountsService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getAccount(@Headers('authorization') auth: string) {
        return this.accountsService.getAccount(auth);
    }

    @Patch('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    editAccount(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditAccount) {
        return this.accountsService.editAccount(auth, body);
    }
}

@Controller('avatars')
export class AvatarsController {
    constructor(private readonly accountsService: AccountsService) {}

    /** Public: the profile photo of an account. The URL carries ?v=<time>, so it can be cached for long. */
    @Get('v1/:id')
    async getAvatar(@Param('id') id: string, @Res() res: Response) {
        const photo = await this.accountsService.getAvatar(id);
        res.set({ 'Content-Type': photo.type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        res.send(photo.body);
    }
}
