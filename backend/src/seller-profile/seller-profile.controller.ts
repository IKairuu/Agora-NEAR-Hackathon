import { Body, Controller, Get, Headers, HttpCode, Patch, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
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
}
