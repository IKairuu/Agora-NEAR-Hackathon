import { useSyncExternalStore, type ReactNode } from 'react';
import type { AuthUser } from '../lib/auth';
import type { Thread } from './actions';
import { BIDS, ORDERS, type Bid, type FilterKey, type Order, type OtherJob } from '../data/sample';

/*
 * App state, mirroring the prototype's `S` object.
 * `stage` drives the scripted demo: 0 signed out, 1 signed in, 2 job posted, 3 bids in,
 * 4 negotiated, 5 funded, 6 bad delivery rejected, 7 released and settled, 8 paused by guardian.
 */
export interface ChatMsg { from: 'agent' | 'them' | 'me' | 'held' | 'sys'; text: string }
export type ModalKind =
  | 'signin' | 'wallets' | 'role' | 'fund' | 'send' | 'receive' | 'addfunds'
  | 'dispute' | 'unpause' | 'reqsvc' | 'ojob' | 'offer' | 'code' | 'walletstep' | 'walletpick';
export interface LiveNote { id: string; kind: string; text: string; link: string | null; time: string; read: boolean }
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
  fold: boolean;
  /* v9: New request chat, hiring and job requests */
  hire: string; offerSt: '' | 'wait' | 'accepted' | 'declined'; declined: string[]; preNeg: boolean;
  asked: boolean; askText: string; bidsShown: number; streamId: number; jf: string;
  extra: { id: string; text: string; t: string; posted: boolean }[];
  who: string; oj: number; exTab: 'services' | 'sellers'; ssort: 'rating' | 'jobs' | 'price'; fromHero: string;
  stars: number; dReason: string; mail: string; walletLinked: boolean;
  /** The real signed-in account from Google or GitHub; null in the simulated demo. */
  user: AuthUser | null;
  /** True when a real account is signed in and the API answered; screens then show API data. */
  live: boolean;
  /** The job the New request, chat and room screens follow in live mode. */
  liveJob: { id: string; ref: string } | null;
  liveThreads: Thread[];
  notes: { unread: number; items: LiveNote[] };
  /** Live balances and pause state from the wallet and limits API. */
  money: { available: number; escrowed: number; usedToday: number; paused: boolean } | null;
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
  fold: storage.get('agora-fold') === '1',
  hire: 'patchsmith', offerSt: '', declined: [], preNeg: false,
  asked: false, askText: '', bidsShown: 0, streamId: 0, jf: 'all', extra: [],
  who: 'patchsmith', oj: 0, exTab: 'services', ssort: 'rating', fromHero: '',
  stars: 0, dReason: '', mail: '', walletLinked: false,
  user: null,
  live: false, liveJob: null, liveThreads: [], notes: { unread: 0, items: [] }, money: null,
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
/** The seller the buyer chose from the offers list (default: the agent's pick). */
const NO_BID: Bid = { key: '', name: '', acct: '', kind: 'human', owner: '', price: 0, final: 0, days: '', fraud: 0, settled: 0, buyers: 0, pass: '', disputes: 0, note: '' };
export const hb = (s: State): Bid => BIDS.find((b) => b.key === s.hire) || BIDS[0] || NO_BID;
/** patchsmith's price drops to the negotiated one once the agent has negotiated. */
export const priceOf = (s: State, b: Bid) => (b.key === 'patchsmith' && s.stage >= 4 && !s.preNeg ? b.final : b.price);
export const hPrice = (s: State) => priceOf(s, hb(s));
export const free = (s: State) => (s.live && s.money ? s.money.available : s.stage >= 5 ? 120 - hPrice(s) : s.stage >= 1 ? 120 : 0);
export const escrow = (s: State) => (s.live && s.money ? s.money.escrowed : s.stage >= 5 && s.stage < 7 ? hPrice(s) : 0);
export const paused = (s: State) => (s.live ? Boolean(s.money?.paused) : s.stage >= 8);

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
