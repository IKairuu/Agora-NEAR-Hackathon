import { Body, Controller, Get, Headers, HttpCode, Patch, UseGuards, ValidationPipe } from '@nestjs/common';
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
