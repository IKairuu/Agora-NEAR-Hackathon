import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * One shared PrismaClient for the whole app.
 *
 * Extending PrismaClient means you can inject PrismaService anywhere and call
 * `this.prisma.<model>.findMany()` directly.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
    }
    // Prisma 7 talks to Postgres through a driver adapter (node-postgres).
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  // Open the connection when Nest boots. (The pg adapter may still connect
  // lazily, so a wrong password can surface on the first query instead.)
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Close the pool when the app shuts down.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
