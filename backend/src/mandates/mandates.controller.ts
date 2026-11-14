import { Body, Controller, Get, Headers, HttpCode, Patch, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { EditMandate } from './dto/EditMandate.dto.js';
import { MandatesService } from './mandates.service.js';

@Controller('mandates')
export class MandatesController {
    constructor(private readonly mandatesService: MandatesService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getMandate(@Headers('authorization') auth: string) {
        return this.mandatesService.getMandate(auth);
    }

    @Patch('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    editMandate(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditMandate) {
        return this.mandatesService.editMandate(auth, body);
    }

    @Post('v1/check')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    checkMandate(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditMandate) {
        return this.mandatesService.checkMandate(auth, body);
    }

    @Post('v1/pause')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    pauseAgents(@Headers('authorization') auth: string) {
        return this.mandatesService.pauseAgents(auth);
    }

    @Post('v1/unpause')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    unpauseAgents(@Headers('authorization') auth: string) {
        return this.mandatesService.unpauseAgents(auth);
    }
}
