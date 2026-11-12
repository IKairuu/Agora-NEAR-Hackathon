import type { ReactNode } from 'react';
import { create } from 'zustand';
import type { AuthUser } from '../lib/auth';
import { authConfigured } from '../lib/supabase';
import type { Thread } from './actions';
import { BIDS, type Bid, type FilterKey, type Order, type OtherJob } from '../data/data';

/*
 * App state, mirroring the prototype's `S` object.
 * `stage` drives the scripted demo: 0 signed out, 1 signed in, 2 job posted, 3 bids in,
 * 4 negotiated, 5 funded, 6 bad delivery rejected, 7 released and settled, 8 paused by guardian.
 */
/** A stored spec as /specs/v1 returns it. */
export interface SpecDoc {
  id: string; version: number; locked: boolean; specHash: string | null;
  testCommand: string; buildCommand: string | null; failingTests: string[]; allowedPaths: string[];
  testFiles: { path: string; content: string }[]; rows: [string, string, string][];
}
/**
 * Live: what the spec writer has produced for the followed job.
 * loading: not asked yet · none: no spec stored (repo says whether one is attached, agents whether the
 * spec writer workflow is connected on this server) · draft / locked: the stored spec.
 */
export type LiveSpec =
  | { state: 'loading' }
  | { state: 'none'; repo: boolean; agents: boolean | null }
  | { state: 'draft' | 'locked'; doc: SpecDoc };
/** The seller profile editor's text fields. Kept in the store so moving between steps never loses them. */
export interface SellForm {
  name: string; title: string; country: string; langs: string; agent: string; model: string;
  yrs: string; edu: string; work: string; bio: string; floor: string; max: string; terms: string; addr: string;
}
/** A real account starts with an empty form, filled from its saved profile; placeholders show examples. */
export const EMPTY_SELL_FORM: SellForm = { name: '', title: '', country: '', langs: '', agent: '', model: '', yrs: '', edu: '', work: '', bio: '', floor: '', max: '', terms: '', addr: '' };
/** The demo's sample seller. */
export const DEMO_SELL_FORM: SellForm = {
  name: '', title: 'Rust and NEAR contract developer', country: 'Philippines', langs: 'English, Filipino', agent: 'lumenfix', model: 'Runs in NEAR AI Cloud (TEE)',
  yrs: 'Student or under 1 year', edu: '', work: '', bio: 'Rust contract fixes with a test for every bug.', floor: '12.00', max: '3',
  terms: '1 to 2 days, includes one extra edge-case test', addr: '0x8b1F…4e2C',
};
export interface FollowUp { id: string; text: string; t: string; sending: boolean; reply?: string; link?: boolean }
export interface ChatMsg { from: 'agent' | 'them' | 'me' | 'held' | 'sys'; text: string }
export type ModalKind =
  | 'signin' | 'wallets' | 'role' | 'fund' | 'send' | 'receive' | 'addfunds'
  | 'dispute' | 'unpause' | 'reqsvc' | 'ojob' | 'offer' | 'code' | 'walletstep' | 'walletpick' | 'linkwallet' | 'walletmove' | 'discard' | 'removejob';
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
  tLog: Record<string, ChatMsg[]>; thread: string; seenThreads: string[]; inboxF: '' | 'buy' | 'sell' | 'all';
  mode: 'buy' | 'sell'; oTab: 'active' | 'req' | 'done'; orders: Order[];
  liked: string[]; newJobs: OtherJob[]; nextJob: number; svc: string;
  sort: 'best' | 'rating' | 'price'; f: Partial<Record<FilterKey, string>>; q: string; online: boolean; newOnly: boolean;
  signVia: string; sellCoder: 'me' | 'agent'; expOpen: string; cvFile: string; avatarImg: string; coverImg: string; ghLinked: boolean;
  fold: boolean;
  /* v9: New request chat, hiring and job requests */
  hire: string; offerSt: '' | 'wait' | 'accepted' | 'declined'; declined: string[]; preNeg: boolean;
  asked: boolean; askText: string; bidsShown: number; streamId: number; jf: string;
  extra: { id: string; text: string; t: string; posted: boolean }[];
  /** Live: the first message of a New request is on its way and the job is being created. */
  pendingAsk: boolean;
  /** Live: messages sent after the first one, about the same job, and the agent's answer to each. */
  followUps: FollowUp[];
  /** Live: the followed job's spec, as stored by the spec writer. */
  liveSpec: LiveSpec;
  /** The seller profile editor's text fields, and whether a real account's saved profile was loaded into them. */
  sellForm: SellForm; sellLoaded: boolean;
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
  /** Which chain the backend uses: in mock mode AGORA balances are test numbers, in real mode they live in the contract. */
  chain: { mode: string; network: string; contract: string; usdc: string | null } | null;
  /** What the linked NEAR account holds in its own wallet, read from the chain (outside AGORA's contract). */
  walletBal: { usdc: number | null; near: number } | null;
  modal: { kind: ModalKind; props?: Record<string, string> } | null;
  /** True once the startup load from the backend has finished, whether or not it returned anything. */
  dataReady: boolean;
  /**
   * True from a page load with a saved real sign-in until that account's data is in (or it turns out it can't be):
   * the screens show "Loading your account" meanwhile, and the demo story is not filled in, so it never flashes.
   */
  restoring: boolean;
}

const storage = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  remove(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export { storage };

/* ---------------- signed-in session, kept across reloads and new tabs ---------------- */
/** What is needed to show the signed-in app again after a reload. Real Google or GitHub tokens stay with Supabase. */
interface SavedSession { via: string; role: State['role']; mode: State['mode']; seller: boolean; user: AuthUser | null }
const SESSION_KEY = 'agora-session';
function loadSession(): SavedSession | null {
  try { const raw = storage.get(SESSION_KEY); return raw ? (JSON.parse(raw) as SavedSession) : null; } catch { return null; }
}
const saved = loadSession();

const initialState: State = {
  stage: saved ? 1 : 0, tour: -1, tourMin: false,
  jobTab: 'bids', dTab: 'open', walTab: 'assets',
  specGen: false, votes: null, voting: false, attack: null,
  cats: { rust: true, fe: true, tests: true, scripts: false }, strict: false, payout: 'near',
  role: saved?.role ?? null, rolePick: null, after: null,
  draft: '', seller: saved?.seller ?? false, sellStep: 0, skills: { Rust: true, 'NEAR SDK': true, Tests: true }, stake: false, sellPay: 'near',
  chatWith: '', chatLog: {}, typing: false,
  tLog: {}, thread: '', seenThreads: [], inboxF: '',
  mode: saved?.mode ?? 'buy', oTab: 'active', orders: [],
  liked: [], newJobs: [], nextJob: 1043, svc: '',
  sort: 'best', f: {}, q: '', online: false, newOnly: false,
  signVia: saved?.via ?? '', sellCoder: 'me', expOpen: 'cv', cvFile: '', avatarImg: '', coverImg: '', ghLinked: false,
  fold: storage.get('agora-fold') === '1',
  hire: '', offerSt: '', declined: [], preNeg: false,
  asked: false, askText: '', bidsShown: 0, streamId: 0, jf: 'all', extra: [],
  who: '', oj: 0, exTab: 'services', ssort: 'rating', fromHero: '',
  stars: 0, dReason: '', mail: '', walletLinked: false,
  user: saved?.user ?? null,
  live: false, liveJob: null, liveThreads: [], notes: { unread: 0, items: [] }, money: null, chain: null, walletBal: null,
  modal: null, dataReady: false, restoring: !!saved?.user && authConfigured, pendingAsk: false, followUps: [], liveSpec: { state: 'loading' },
  sellForm: DEMO_SELL_FORM, sellLoaded: false,
};

/*
 * The app state lives in a Zustand store. The functions below are the app's API to it:
 * - useApp(): the whole state in a component (re-renders on every change, as before);
 *   for a narrower re-render use the store directly, e.g. useAppStore((s) => s.mode);
 * - getState() / setState(patch) outside React, in actions and the live data loaders;
 * - subscribe(cb) to run code after every change.
 * setState merges a partial state, like Zustand's own; setState({}) still redraws the screens after the
 * shared data objects in data/data.ts were changed in place.
 */
export const useAppStore = create<State>()(() => initialState);

/** Calls cb after every state change. Returns the unsubscribe function. */
export const subscribe = (cb: () => void) => useAppStore.subscribe(() => cb());

/**
 * Writes the session while the user is signed in and removes it once they sign out.
 * Skipped during the demo tour, which moves `stage` itself, including to 0 on its first step.
 */
let savedRaw = saved ? JSON.stringify(saved) : '';
useAppStore.subscribe((state) => {
  if (state.tour >= 0) return;
  const raw = state.stage >= 1
    ? JSON.stringify({ via: state.signVia, role: state.role, mode: state.mode, seller: state.seller, user: state.user } satisfies SavedSession)
    : '';
  if (raw === savedRaw) return;
  savedRaw = raw;
  if (raw) storage.set(SESSION_KEY, raw); else storage.remove(SESSION_KEY);
});

export const getState = (): State => useAppStore.getState();
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  useAppStore.setState(patch);
}
export function useApp(): State {
  return useAppStore();
}

/* derived values */
/** The seller the buyer chose from the offers list (default: the agent's pick). */
/** Stand-in while no offer exists, e.g. right after a live sign-in empties BIDS, so views never read a field of undefined. */
const NO_SELLER: Bid = { key: '', name: 'No seller yet', acct: '', kind: 'human', owner: '', price: 0, final: 0, days: '', fraud: 0, settled: 0, buyers: 0, pass: '', disputes: 0, note: '' };
export const hb = (s: State): Bid => BIDS.find((b) => b.key === s.hire) || BIDS[0] || NO_SELLER;
/** A seller's price drops to the negotiated `final` once the agent has negotiated (the demo data sets it lower for one seller). */
export const priceOf = (s: State, b: Bid) => (s.stage >= 4 && !s.preNeg ? b.final : b.price);
export const hPrice = (s: State) => priceOf(s, hb(s));
export const free = (s: State) => (s.live && s.money ? s.money.available : s.stage >= 5 ? 120 - hPrice(s) : s.stage >= 1 ? 120 : 0);
export const escrow = (s: State) => (s.live && s.money ? s.money.escrowed : s.stage >= 5 && s.stage < 7 ? hPrice(s) : 0);
export const paused = (s: State) => (s.live ? Boolean(s.money?.paused) : s.stage >= 8);

/* ---------------- toasts ---------------- */
export interface Toast { id: number; msg: ReactNode; kind: 'ok' | 'hold' | 'block' }
/** Toasts have their own small store, so showing one does not redraw every screen. */
const useToastStore = create<{ list: Toast[] }>()(() => ({ list: [] }));
let toastId = 0;
export function toast(msg: ReactNode, kind: Toast['kind'] = 'ok', ms = 4200) {
  const id = ++toastId;
  useToastStore.setState((s) => ({ list: [...s.list, { id, msg, kind }].slice(-2) }));
  setTimeout(() => useToastStore.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), Math.min(ms, 4000));
}
export function useToasts(): Toast[] {
  return useToastStore((s) => s.list);
}

/**
 * The seller screens (dashboard, orders, open jobs) need a published seller profile.
 * Guests see the sign-in gate instead; the demo tour shows everything, as before.
 */
export const sellerLocked = (s: State) => s.tour < 0 && s.stage >= 1 && !s.seller;

/* ---------------- modal ---------------- */
export const openModal = (kind: ModalKind, props?: Record<string, string>) => setState({ modal: { kind, props } });
export const closeModal = () => setState({ modal: null });
