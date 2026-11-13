import { Body, Controller, Get, Headers, HttpCode, Patch, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateSellerStake } from './dto/CreateSellerStake.dto.js';
import { EditSellerProfile } from './dto/EditSellerProfile.dto.js';
import { SellerProfileService } from './seller-profile.service.js';

@Controller('seller-profile')
export class SellerProfileController {
    constructor(private readonly sellerProfileService: SellerProfileService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getProfile(@Headers('authorization') auth: string) {
        return this.sellerProfileService.getProfile(auth);
    }

    @Patch('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    editProfile(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditSellerProfile) {
        return this.sellerProfileService.editProfile(auth, body);
    }

    @Post('v1/publish')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    publishProfile(@Headers('authorization') auth: string) {
        return this.sellerProfileService.publishProfile(auth);
    }

    /** Copies the GitHub login linked to the signed-in account onto the seller profile. */
    @Post('v1/github')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    syncGithub(@Headers('authorization') auth: string) {
        return this.sellerProfileService.syncGithub(auth);
    }

    @Post('v1/stake')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    addStake(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateSellerStake) {
        return this.sellerProfileService.addStake(auth, body);
    }

    @Post('v1/unstake')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    returnStake(@Headers('authorization') auth: string) {
        return this.sellerProfileService.returnStake(auth);
    }
}
