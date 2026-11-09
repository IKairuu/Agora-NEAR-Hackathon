import { Controller, Get, HttpCode, Query } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

@Controller('open-jobs')
export class OpenJobsController {
    constructor(private readonly jobsService: JobsService) {}

    @Get('v1')
    @HttpCode(200)
    getOpenJobs(@Query('cat') cat: string, @Query('q') q: string) {
        return this.jobsService.getOpenJobs(cat, q);
    }
}
