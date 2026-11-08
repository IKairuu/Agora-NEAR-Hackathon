import 'dotenv/config';

export const constants = {
    secret: process.env['SUPABASE_JWT_SECRET'] ?? '',
    supabaseUrl: (process.env['SUPABASE_URL'] ?? '').replace(/\/$/, ''),
    audience: 'authenticated',
};
