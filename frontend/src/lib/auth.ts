import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OAuthVia = 'google' | 'github';
/** Onboarding answers saved on the account. A question that was skipped has no entry, so it is asked again next sign-in. */
export interface Onboarding { role?: 'hire' | 'work'; wallet?: boolean }
export interface AuthUser { id: string; email: string; name: string; avatar: string; via: string; isNew: boolean; onboarding: Onboarding }

/** What the app was doing when the user left for Google or GitHub, so the flow resumes after the redirect. */
export interface PendingSignIn { via: OAuthVia | 'wallet' | 'email'; after: 'sell' | 'ask' | null; rolePick: 'hire' | 'work' | null; tour: number; draft: string }

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

/** The Google and GitHub sign-ins linked to this AGORA account: the Google email and the GitHub login. One of each at most. */
export interface LinkedIds { google: string | null; github: string | null }
export const NO_IDS: LinkedIds = { google: null, github: null };

export function linkedIdsOf(session: Session | null): LinkedIds {
  const ids = session?.user.identities ?? [];
  const data = (p: string) => (ids.find((i) => i.provider === p)?.identity_data ?? null) as Record<string, unknown> | null;
  const g = data('google'), gh = data('github');
  return {
    google: g ? String(g['email'] ?? 'Linked') : null,
    github: gh ? String(gh['user_name'] ?? gh['preferred_username'] ?? 'Linked') : null,
  };
}

const LINKING_KEY = 'agora-linking';
const NAMES: Record<OAuthVia, string> = { google: 'Google', github: 'GitHub' };

/** Which provider the user left to link, so the app can say what happened when they come back. */
export function takeLinking(): OAuthVia | null {
  try {
    const v = sessionStorage.getItem(LINKING_KEY);
    sessionStorage.removeItem(LINKING_KEY);
    return v === 'google' || v === 'github' ? v : null;
  } catch { return null; }
}

/** Supabase's error text, in words a user can act on. */
export function linkErrorText(raw: string, via: OAuthVia | null): string {
  const name = via ? NAMES[via] : 'That';
  if (/already.*(linked|exists|registered)|identity_already_exists/i.test(raw)) return `That ${via ? NAMES[via] + ' ' : ''}account already belongs to another AGORA account. Sign in with it to open that account, or link a different one.`;
  if (/manual linking/i.test(raw)) return 'Linking is turned off on the server. In Supabase, turn on Authentication → Sign In / Providers → Allow manual linking.';
  return `${name} was not linked: ${raw}`;
}

/**
 * Links Google or GitHub to the account that is signed in now, so either one opens this same account later.
 * One of each: if this account already has a GitHub, it must be unlinked first. A GitHub that already belongs
 * to another AGORA account is refused by Supabase. Sends the browser to the provider; resolves with an error message, or null.
 */
export async function linkProvider(via: OAuthVia): Promise<string | null> {
  if (!supabase) return 'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  const { data } = await supabase.auth.getUser();
  if (!data.user) return 'Sign in first.';
  if ((data.user.identities ?? []).some((i) => i.provider === via)) return `This account already has a ${NAMES[via]} account linked. Unlink it first to use a different one.`;
  try { sessionStorage.setItem(LINKING_KEY, via); } catch { /* ignore */ }
  const { error } = await supabase.auth.linkIdentity({
    provider: via,
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      scopes: via === 'github' ? 'read:user' : undefined,
      queryParams: via === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
  if (error) { takeLinking(); return linkErrorText(error.message, via); }
  return null;
}

/** Removes the Google or GitHub sign-in from this account. The last way to sign in can't be removed. Resolves with an error message, or null. */
export async function unlinkProvider(via: OAuthVia): Promise<string | null> {
  if (!supabase) return 'Sign-in is not configured.';
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error || !data) return error?.message ?? 'Could not read your sign-in methods.';
  const identity = data.identities.find((i) => i.provider === via);
  if (!identity) return null;
  if (data.identities.length < 2) return `${NAMES[via]} is your only way to sign in, so it can't be removed. Link another one first.`;
  const res = await supabase.auth.unlinkIdentity(identity);
  if (res.error) return res.error.message;
  await supabase.auth.refreshSession();
  return null;
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

/**
 * Finishes a NEAR wallet sign-in: the backend checked the wallet's signature and returned a one-time token,
 * which Supabase swaps for a normal session (the same kind Google gives). Resolves with an error message, or null.
 */
export async function finishWalletSignIn(tokenHash: string): Promise<string | null> {
  if (!supabase) return 'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  return error ? error.message : null;
}

/**
 * Email sign-in, step 1: Supabase emails a one-time code (and a sign-in link) to the address.
 * Signing in this way creates the account the first time. Resolves with an error message, or null.
 */
export async function sendEmailCode(email: string): Promise<string | null> {
  if (!supabase) return 'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname } });
  return error ? error.message : null;
}

/** Email sign-in, step 2: the code from the email becomes a normal Supabase session. Resolves with an error message, or null. */
export async function verifyEmailCode(email: string, code: string): Promise<string | null> {
  if (!supabase) return 'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  return error ? error.message : null;
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
