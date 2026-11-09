import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateSpec } from './dto/CreateSpec.dto.js';
import { CreateSpecBulk } from './dto/CreateSpecBulk.dto.js';
import { EditSpec } from './dto/EditSpec.dto.js';
import { LockSpec } from './dto/LockSpec.dto.js';
import { SealSpecHoldout } from './dto/SealSpecHoldout.dto.js';
import { SpecsService } from './specs.service.js';

@Controller('specs')
export class SpecsController {
    constructor(private readonly specsService: SpecsService) {}

    @Post('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createSpec(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateSpec) {
        return this.specsService.createSpec(auth, body);
    }

    @Post('v1/bulk-create')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    createSpecs(@Headers('authorization') auth: string, @Body(ValidationPipe) body: CreateSpecBulk) {
        return this.specsService.createSpecs(auth, body);
    }

    @Post('v1/lock')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    lockSpec(@Headers('authorization') auth: string, @Body(ValidationPipe) body: LockSpec) {
        return this.specsService.lockSpec(auth, body);
    }

    @Post('v1/holdout')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    sealHoldout(@Headers('authorization') auth: string, @Body(ValidationPipe) body: SealSpecHoldout) {
        return this.specsService.sealHoldout(auth, body);
    }

    @Get('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getSpecs(@Headers('authorization') auth: string, @Query('job') job: string) {
        return this.specsService.getSpecs(auth, job);
    }

    @Get('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    getSpec(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.specsService.getSpec(auth, id);
    }

    @Patch('v1')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    editSpec(@Headers('authorization') auth: string, @Body(ValidationPipe) body: EditSpec) {
        return this.specsService.editSpec(auth, body);
    }

    @Delete('v1/:id')
    @HttpCode(200)
    @UseGuards(AuthGuard)
    deleteSpec(@Headers('authorization') auth: string, @Param('id') id: string) {
        return this.specsService.deleteSpec(auth, id);
    }
}
