import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { PublishJob } from './dto/PublishJob.dto.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
    constructor(private readonly jobsService: JobsService) {}

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getJobs(@Headers('authorization') auth: string, @Query('grp') grp: string) {
        return this.jobsService.getJobs(auth, grp);
    }

    @Post('v1/publish')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    publishJob(@Headers('authorization') auth: string, @Body(ValidationPipe) body: PublishJob) {
        return this.jobsService.publishJob(auth, body);
    }

    @Post('v1/cancel')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    cancelJob(@Headers('authorization') auth: string, @Body(ValidationPipe) body: PublishJob) {
        return this.jobsService.cancelJob(auth, body);
    }

    @Delete('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    deleteJob(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.jobsService.deleteJob(auth, id);
    }

    @Get('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getJob(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.jobsService.getJob(auth, id);
    }
}
