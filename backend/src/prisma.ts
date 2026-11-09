import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');

/*
 * The Supabase database is far from the dev machines: a new connection takes about 1.8 s and each query
 * about 0.3 s. Prisma's default 2 s wait to start a transaction is then too short and requests fail with
 * P2028 ("Unable to start a transaction in the given time"), so allow more time.
 */
export const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
});
