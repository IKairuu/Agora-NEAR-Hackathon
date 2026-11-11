import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { JobAction } from './dto/JobAction.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getPayment(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.paymentsService.getPayment(auth, job);
    }

    @Post('v1/refund')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    refund(@Headers('authorization') auth: string, @Body(ValidationPipe) body: JobAction) {
        return this.paymentsService.refund(auth, body);
    }

    @Post('v1/extra-attempt')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    grantAttempt(@Headers('authorization') auth: string, @Body(ValidationPipe) body: JobAction) {
        return this.paymentsService.grantAttempt(auth, body);
    }

    @Post('v1/refund-expired')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    refundExpired(@Headers('authorization') auth: string, @Body(ValidationPipe) body: JobAction) {
        return this.paymentsService.refundExpired(auth, body);
    }
}
