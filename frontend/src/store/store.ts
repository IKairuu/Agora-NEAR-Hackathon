import { useSyncExternalStore, type ReactNode } from 'react';
import { ORDERS, type FilterKey, type Order, type OtherJob } from '../data/sample';

/*
 * App state, mirroring the prototype's `S` object.
 * `stage` drives the scripted demo: 0 signed out, 1 signed in, 2 job posted, 3 bids in,
 * 4 negotiated, 5 funded, 6 bad delivery rejected, 7 released and settled, 8 paused by guardian.
 */
export interface ChatMsg { from: 'agent' | 'them' | 'me' | 'held' | 'sys'; text: string }
export type ModalKind =
  | 'signin' | 'wallets' | 'role' | 'fund' | 'send' | 'receive' | 'addfunds'
  | 'dispute' | 'unpause' | 'reqsvc' | 'ojob' | 'offer';
export interface State {
  stage: number;
  tour: number; tourMin: boolean;
  jobTab: 'bids' | 'neg' | 'spec'; dTab: 'open' | 'ruled'; walTab: 'assets' | 'activity';
  specGen: boolean; votes: number[] | null; voting: boolean; attack: { n: number } | null;
  cats: Record<string, boolean>; strict: boolean; payout: string;
  role: 'hire' | 'work' | null; rolePick: 'hire' | 'work' | null; after: 'sell' | 'ask' | null;
  draft: string; seller: boolean; sellStep: number; skills: Record<string, boolean>; stake: boolean; sellPay: string;
  chatWith: string; chatLog: Record<string, ChatMsg[]>; typing: boolean;
  tLog: Record<string, ChatMsg[]>; thread: string; inboxF: '' | 'buy' | 'sell' | 'all'; flat: boolean;
  mode: 'buy' | 'sell'; oTab: 'active' | 'req' | 'done'; orders: Order[];
  liked: string[]; newJobs: OtherJob[]; nextJob: number; svc: string;
  sort: 'best' | 'rating' | 'price'; f: Partial<Record<FilterKey, string>>; q: string; online: boolean; newOnly: boolean;
  signVia: string; sellCoder: 'me' | 'agent'; expOpen: string; cvFile: string; avatarImg: string; coverImg: string; ghLinked: boolean;
  hsTab: 'quick' | 'trend'; fold: boolean;
  modal: { kind: ModalKind; props?: Record<string, string> } | null;
}

const storage = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
export { storage };

let state: State = {
  stage: 0, tour: -1, tourMin: false,
  jobTab: 'bids', dTab: 'open', walTab: 'assets',
  specGen: false, votes: null, voting: false, attack: null,
  cats: { rust: true, fe: true, tests: true, scripts: false }, strict: false, payout: 'near',
  role: null, rolePick: null, after: null,
  draft: '', seller: false, sellStep: 0, skills: { Rust: true, 'NEAR SDK': true, Tests: true }, stake: false, sellPay: 'near',
  chatWith: 'patchsmith', chatLog: {}, typing: false,
  tLog: {}, thread: '', inboxF: '', flat: false,
  mode: 'buy', oTab: 'active', orders: ORDERS.map((o) => ({ ...o })),
  liked: ['g3'], newJobs: [], nextJob: 1043, svc: 'g1',
  sort: 'best', f: {}, q: '', online: false, newOnly: false,
  signVia: '', sellCoder: 'me', expOpen: 'cv', cvFile: '', avatarImg: '', coverImg: '', ghLinked: false,
  hsTab: 'quick', fold: storage.get('agora-fold') === '1',
  modal: null,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
}
export function useApp(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

/* derived values */
export const free = (s: State) => (s.stage >= 5 ? 88 : s.stage >= 1 ? 120 : 0);
export const escrow = (s: State) => (s.stage >= 5 && s.stage < 7 ? 32 : 0);
export const paused = (s: State) => s.stage >= 8;

/* ---------------- toasts ---------------- */
export interface Toast { id: number; msg: ReactNode; kind: 'ok' | 'hold' | 'block' }
let toasts: Toast[] = [];
let toastId = 0;
const toastListeners = new Set<() => void>();
export function toast(msg: ReactNode, kind: Toast['kind'] = 'ok', ms = 4200) {
  const id = ++toastId;
  toasts = [...toasts, { id, msg, kind }].slice(-2);
  toastListeners.forEach((l) => l());
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); toastListeners.forEach((l) => l()); }, Math.min(ms, 4000));
}
export function useToasts() {
  return useSyncExternalStore((cb) => { toastListeners.add(cb); return () => { toastListeners.delete(cb); }; }, () => toasts, () => toasts);
}

/* ---------------- modal ---------------- */
export const openModal = (kind: ModalKind, props?: Record<string, string>) => setState({ modal: { kind, props } });
export const closeModal = () => setState({ modal: null });
