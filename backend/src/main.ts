import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.enableCors({ origin: (process.env['CORS_ORIGIN'] ?? 'http://localhost:5173').split(',').map((o) => o.trim()) });
    await app.listen(process.env['PORT'] ?? 3000);
}
void bootstrap();
