import { useSyncExternalStore } from 'react';

/*
 * Session for the frontend.
 *
 * MOCK: `signInWithGoogle` does not talk to Google yet. It waits briefly and returns a
 * sample testnet account so the onboarding screens can be built and reviewed.
 * Replace its body with the real NEAR social login (Google -> NEAR account + agent
 * sub-account, gas paid by the relayer) once the backend exposes it. Nothing else
 * in the UI needs to change: screens only read `useSession()` and call these functions.
 */

export type AccountType = 'hire' | 'freelancer' | 'agent';

export interface Session {
  name: string;
  email: string;
  account: string; // NEAR account, e.g. lumen.testnet
  agents: string; // sub-account that holds agent keys
  initials: string;
  type: AccountType | null; // null until the person picks what brings them here
}

const KEY = 'agora-session';
const listeners = new Set<() => void>();
let cache: Session | null | undefined;
let signedOutByUser = false;

function read(): Session | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function write(s: Session | null): void {
  cache = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: the session lives in memory for this tab */ }
  listeners.forEach((l) => l());
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => null,
  );
}

export function getSession(): Session | null {
  return read();
}

/** MOCK Google sign-in. Signing in again keeps the existing account and its type. */
export async function signInWithGoogle(): Promise<Session> {
  await new Promise((r) => setTimeout(r, 900));
  signedOutByUser = false;
  const existing = read();
  if (existing) return existing;
  const s: Session = {
    name: 'Lumen Labs',
    email: 'team@lumenlabs.example',
    account: 'lumen.testnet',
    agents: 'agents.lumen.testnet',
    initials: 'LL',
    type: null,
  };
  write(s);
  return s;
}

export function setAccountType(type: AccountType): void {
  const s = read();
  if (s) write({ ...s, type });
}

export function signOut(): void {
  signedOutByUser = true;
  write(null);
}

/** Where a signed-in page sends someone with no session: home after signing out, otherwise sign-up. */
export function signedOutPath(): string {
  return signedOutByUser ? '/' : '/start';
}

export const HOME_FOR: Record<AccountType, string> = {
  hire: '/app/hire',
  freelancer: '/app/freelancer',
  agent: '/app/agent',
};

/** Where a person goes after signing in. */
export function nextPathFor(s: Session | null): string {
  if (!s) return '/start';
  return s.type ? HOME_FOR[s.type] : '/start/role';
}
