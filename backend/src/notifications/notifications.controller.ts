import { Body, Controller, Get, Headers, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ReadNotifications } from './dto/ReadNotifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getNotifications(@Headers('authorization') auth: string) {
        return this.notificationsService.getNotifications(auth);
    }

    @Post('v1/read')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    readNotifications(@Headers('authorization') auth: string, @Body(ValidationPipe) body: ReadNotifications) {
        return this.notificationsService.readNotifications(auth, body);
    }
}
