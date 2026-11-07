// Prisma CLI config (used by `prisma generate`, `prisma migrate`, `prisma studio`).
// Prisma 7 does not read .env by itself, so we load it here with dotenv.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // The CLI runs migrations, which need a direct (non-pooled) connection.
    // On Supabase that is the port 5432 "Direct connection" / session URL.
    url: process.env['DIRECT_URL'],
  },
});
