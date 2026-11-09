import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateReview } from './dto/CreateReview.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller('reviews')
export class ReviewsController {
    constructor(private readonly reviewsService: ReviewsService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getReviews(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.reviewsService.getReviews(auth, job);
    }

    @Get('v1/evidence')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getEvidence(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.reviewsService.getEvidence(auth, job);
    }

    @Post('v1/rerun')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    rerunReview(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateReview) {
        return this.reviewsService.rerunReview(auth, body);
    }
}
