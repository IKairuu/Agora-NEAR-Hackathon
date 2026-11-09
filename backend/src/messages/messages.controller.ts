import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateMessage } from './dto/CreateMessage.dto.js';
import { CreateThread } from './dto/CreateThread.dto.js';
import { MessagesService } from './messages.service.js';

@Controller('threads')
export class MessagesController {
    constructor(private readonly messagesService: MessagesService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getThreads(@Headers('authorization') auth: string, @Query('side') side: string) {
        return this.messagesService.getThreads(auth, side);
    }

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createThread(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateThread) {
        return this.messagesService.createThread(auth, body);
    }

    @Get('v1/:id/messages')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getMessages(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.messagesService.getMessages(auth, id);
    }

    @Post('v1/:id/messages')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createMessage(@Headers('authorization') auth: string, @Param('id') id: string, @Body(ValidationPipe) body: CreateMessage) {
        return this.messagesService.createMessage(auth, id, body);
    }
}
