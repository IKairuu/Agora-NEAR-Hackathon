import { supabase } from './supabase';
import { toast } from '../store/store';

/** An error the API answered with. `message` is already readable and has been shown as a toast. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

let offlineWarned = false;

/**
 * Calls the AGORA API at /api (Vite proxies it to the backend in development).
 * Adds the Supabase session token, turns error responses into a red toast, and throws ApiError.
 * Pass quiet to skip the toast, for background refreshes.
 */
export async function api<T>(path: string, opts: { method?: string; body?: unknown; quiet?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (session) headers['Authorization'] = `Bearer ${session.access_token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch('/api' + path, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    if (!opts.quiet && !offlineWarned) { offlineWarned = true; toast('Cannot reach the AGORA server. Showing sample data.', 'block'); }
    throw new ApiError('offline', 0);
  }
  offlineWarned = false;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const raw = (data as { message?: unknown } | null)?.message;
    const message = Array.isArray(raw) ? raw.join('. ') : typeof raw === 'string' ? raw : `Request failed (${res.status})`;
    if (!opts.quiet) toast(message, 'block');
    throw new ApiError(message, res.status);
  }
  return data as T;
}
