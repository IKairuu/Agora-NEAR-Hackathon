import { Body, Controller, Get, Headers, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateDeposit } from './dto/CreateDeposit.dto.js';
import { CreateWithdrawal } from './dto/CreateWithdrawal.dto.js';
import { LinkWallet } from './dto/LinkWallet.dto.js';
import { SignInWallet } from './dto/SignInWallet.dto.js';
import { SyncWalletTx } from './dto/SyncWalletTx.dto.js';
import { WalletService } from './wallet.service.js';

@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getWallet(@Headers('authorization') auth: string) {
        return this.walletService.getWallet(auth);
    }

    @Post('v1/withdraw')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createWithdrawal(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateWithdrawal) {
        return this.walletService.createWithdrawal(auth, body);
    }

    @Post('v1/deposit')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createDeposit(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateDeposit) {
        return this.walletService.createDeposit(auth, body);
    }

    @Post('v1/link')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    linkWallet(@Headers('authorization') auth: string, @Body(ValidationPipe) body: LinkWallet) {
        return this.walletService.linkWallet(auth, body);
    }

    @Post('v1/sync')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    syncWalletTx(@Headers('authorization') auth: string, @Body(ValidationPipe) body: SyncWalletTx) {
        return this.walletService.syncWalletTx(auth, body);
    }

    @Post('v1/agents/prepare')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    prepareAgents(@Headers('authorization') auth: string) {
        return this.walletService.prepareAgents(auth);
    }

    @Post('v1/agents/confirm')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    confirmAgents(@Headers('authorization') auth: string) {
        return this.walletService.confirmAgents(auth);
    }

    @Post('v1/sign-in')
    @HttpCode(200)
    signInWithWallet(@Body(ValidationPipe) body: SignInWallet) {
        return this.walletService.signInWithWallet(body);
    }
}
