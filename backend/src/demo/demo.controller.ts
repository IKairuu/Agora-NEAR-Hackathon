import { Controller, Get, HttpCode } from '@nestjs/common';
import { DEMO_DATA } from './demo-data.js';

/** Public: the "Play demo" tour runs before anyone signs in. */
@Controller('demo')
export class DemoController {
    @Get('v1')
    @HttpCode(200)
    getDemo() {
        return DEMO_DATA;
    }
}
