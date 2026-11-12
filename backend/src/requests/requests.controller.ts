import { Body, Controller, Delete, Headers, HttpCode, Param, Patch, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateRequest } from './dto/CreateRequest.dto.js';
import { CreateRequestBulk } from './dto/CreateRequestBulk.dto.js';
import { EditRequest } from './dto/EditRequest.dto.js';
import { RequestsService } from './requests.service.js';

@Controller('requests')
export class RequestsController {
    constructor(private readonly requestsService: RequestsService) {}

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createRequest(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateRequest) {
        return this.requestsService.createRequest(auth, body);
    }

    @Post('v1/bulk-create')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createRequests(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateRequestBulk) {
        return this.requestsService.createRequests(auth, body);
    }

    @Patch('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    editRequest(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditRequest) {
        return this.requestsService.editRequest(auth, body);
    }

    @Post('v1/:id/keep-waiting')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    keepWaiting(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.requestsService.keepWaiting(auth, id);
    }

    @Delete('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    cancelRequest(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.requestsService.cancelRequest(auth, id);
    }
}
