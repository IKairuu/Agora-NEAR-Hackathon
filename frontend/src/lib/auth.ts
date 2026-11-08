import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OAuthVia = 'google' | 'github';
/** Onboarding answers saved on the account. A question that was skipped has no entry, so it is asked again next sign-in. */
export interface Onboarding { role?: 'hire' | 'work'; wallet?: boolean }
export interface AuthUser { id: string; email: string; name: string; avatar: string; via: string; isNew: boolean; onboarding: Onboarding }

/** What the app was doing when the user left for Google or GitHub, so the flow resumes after the redirect. */
export interface PendingSignIn { via: OAuthVia; after: 'sell' | 'ask' | null; rolePick: 'hire' | 'work' | null; tour: number; draft: string }

const PENDING_KEY = 'agora-oauth-pending';

export function savePending(p: PendingSignIn) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
export function takePending(): PendingSignIn | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingSignIn) : null;
  } catch { return null; }
}

/**
 * Sends the browser to Google's or GitHub's own sign-in page. The user types their password there,
 * never into AGORA; the provider then redirects back here with a one-time code that Supabase exchanges
 * for a session. Resolves with an error message only if the redirect could not start.
 */
export async function startOAuth(via: OAuthVia): Promise<string | null> {
  if (!supabase) return 'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: via,
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      scopes: via === 'github' ? 'read:user user:email' : undefined,
      queryParams: via === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
  return error ? error.message : null;
}

export function userOf(session: Session): AuthUser {
  const u = session.user;
  const m = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email ?? '',
    name: (m['full_name'] as string) || (m['name'] as string) || (m['user_name'] as string) || u.email || 'You',
    avatar: (m['avatar_url'] as string) || '',
    via: (u.app_metadata?.['provider'] as string) || '',
    isNew: !u.last_sign_in_at || Math.abs(Date.parse(u.last_sign_in_at) - Date.parse(u.created_at)) < 60_000,
    onboarding: (m['agora_onboarding'] as Onboarding | undefined) ?? {},
  };
}

/** A provider error comes back in the URL (for example when the user presses Cancel on GitHub). */
export function takeUrlError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const msg = params.get('error_description') || hash.get('error_description');
  if (!msg) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return msg.replace(/\+/g, ' ');
}

export function signOutRemote() {
  if (supabase) void supabase.auth.signOut();
}

/** Stores onboarding answers in the account's user_metadata, so they follow the user to any device. */
export async function saveOnboarding(next: Onboarding) {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser({ data: { agora_onboarding: next } });
  if (error) console.warn('Could not save onboarding answers:', error.message);
}
