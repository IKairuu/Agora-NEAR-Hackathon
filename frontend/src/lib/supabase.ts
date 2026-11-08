import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * Browser Supabase client. Uses the publishable (anon) key only: it is safe to ship to the browser,
 * and Row Level Security decides what it can read. Never put the service-role key in VITE_ variables.
 * When the variables are missing the app falls back to the prototype's simulated sign-in.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })
  : null;

export const authConfigured = supabase !== null;
