import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ARRIVE, ATTACK, BIDS, gigBy, JOB, KICKOFF, ME, O_ST, OTHER_JOBS, REPLIES, REVIEWERS, sellerBy, T_MSGS, T_TIME, THREADS, usd, type Order } from '../data/data';
import { finishWalletSignIn, linkedIdsOf, linkErrorText, linkProvider, NO_IDS, takeLinking, unlinkProvider, sendEmailCode, verifyEmailCode, saveOnboarding, savePending, signOutRemote, startOAuth, takePending, takeUrlError, userOf, type OAuthVia, type Onboarding } from '../lib/auth';
import { authConfigured, supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { OwnershipProof } from '../lib/near';
import { liveMessageSeller, liveReadThread, appDataLoaded, beginRestoring, demoLoaded, goLive, isLive, leaveLive, stopRestoring, liveAddFunds, liveWithdraw as liveMockWithdraw, walletMode, liveDiscardAsk, liveLeaveAsk, liveDisputeNext, liveOpenDispute, liveBundle, livePause, liveRate, liveSaveMandate, liveUnpause, liveHire, liveKeepWait, liveLike, liveOpenGig, liveWho, liveLoadSellProfile, liveLockSpec, liveOrderAccept, liveOrderDecline, livePlaceBid, livePostPublic, livePublishSeller, liveRequestService, liveRole, liveSendOffer, liveSendThread, liveSend } from '../lib/live';
import { closeModal, getState, hb, hPrice, openModal, setState, storage, toast, type ChatMsg, type State } from './store';

/* ---------------- navigation ---------------- */
type NavFn = (to: string) => void;
let navigateFn: NavFn = (to) => { location.assign(to); };
export const setNavigate = (fn: NavFn) => { navigateFn = fn; };
/** Route names follow the prototype: 'home', 'ask', 'jobs', ... */
export const pathOf = (r: string) => (r === 'home' ? '/' : '/' + r);
export function go(r: string) {
  navigateFn(pathOf(r));
  window.scrollTo(0, 0);
}
const hAmt = () => usd(hPrice(getState()));
const OFF_PLATFORM = /telegram|whatsapp|outside|off.?platform|paypal|direct(ly)? pay/i;
const clock = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/** Bring the newest message of a chat log into view. */
export function scrollMsgs() {
  requestAnimationFrame(() => document.getElementById('msgs')?.lastElementChild?.scrollIntoView({ block: 'nearest' }));
}
/** Bring the newest New request message into view. */
export function acScroll() {
  requestAnimationFrame(() => document.getElementById('aclog')?.lastElementChild?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
}

/* ---------------- chat with the hired seller ---------------- */
/** After the seller accepts, they write first. */
export function chatLog(key: string): ChatMsg[] {
  const first = KICKOFF[key] || KICKOFF[''];
  return getState().chatLog[key] ?? (first ? [{ from: 'them', text: first }] : []);
}
export function sendChat(raw: string) {
  const text = raw.trim();
  if (!text) return;
  const key = hb(getState()).key;
  const log: ChatMsg[] = [...chatLog(key), { from: 'me', text }];
  if (OFF_PLATFORM.test(text))
    log.push({ from: 'held', text: 'The fraud and lure agent flagged this message. Payment outside escrow is not protected, and the contract only pays the seller account bound to this job.' });
  setState((s) => ({ chatLog: { ...s.chatLog, [key]: log }, typing: true }));
  scrollMsgs();
  setTimeout(() => {
    const reply = REPLIES[key];
    setState((s) => ({ typing: false, chatLog: { ...s.chatLog, [key]: reply ? [...chatLog(key), { from: 'them', text: reply }] : chatLog(key) } }));
    scrollMsgs();
  }, 1100);
}

/* ---------------- Messages: one inbox, a thread per job and seller ---------------- */
export interface Thread {
  k: string; mode: 'buy' | 'sell'; who: string; ag?: boolean; job: string; title: string;
  st: [string, string]; amt: string; last: string; time: string; unread?: boolean; order?: Order; msgs: ChatMsg[];
}
/** Messages for a non-demo thread; seeded from the sample data the first time it is read. */
const threadLog = (k: string, seed?: [ChatMsg['from'], string][]): ChatMsg[] =>
  getState().tLog[k] ?? (seed ?? T_MSGS[k] ?? []).map(([from, text]) => ({ from, text }));
export function threads(): Thread[] {
  const s = getState();
  if (s.live) return s.liveThreads;
  const out: Thread[] = [];
  if (s.stage >= 5 || (s.stage >= 4 && s.offerSt)) {
    const b = hb(s); const log = s.stage >= 5 ? chatLog(b.key) : []; const last = log[log.length - 1];
    out.push({
      k: 'demo', mode: 'buy', who: b.name, ag: b.kind === 'agent', job: JOB.id, title: JOB.title,
      st: s.stage >= 7 ? ['ok', 'Paid'] : s.stage >= 5 ? ['acc', 'Payment protected'] : s.offerSt === 'declined' ? ['block', 'Declined'] : ['hold', 'Waiting on seller'],
      amt: hAmt(), last: last ? last.text : (s.offerSt === 'declined' ? b.name + ' declined the offer' : 'Hire offer sent by your agent'), time: 'Now', unread: s.stage === 4, msgs: log,
    });
  }
  const add = (t: Omit<Thread, 'msgs' | 'last' | 'time'>, seed?: [ChatMsg['from'], string][], time?: string) => {
    const msgs = threadLog(t.k, seed); const l = msgs[msgs.length - 1];
    out.push({ ...t, msgs, last: l ? l.text : '', time: time ?? T_TIME[t.k] ?? '' });
  };
  s.newJobs.filter((j) => j.who).forEach((j) => add({ k: 'n' + j.id, mode: 'buy', who: j.who, job: j.id, title: j.title, st: j.status, amt: j.budget }, [['me', `Request sent: ${j.title}`], ['sys', 'Waiting for the seller to answer with an offer.']], 'Now'));
  /* sample threads from the demo data; each one belongs to one of the demo's other job requests */
  THREADS.forEach((th) => {
    const j = OTHER_JOBS.find((x) => x.id === th.job); if (!j) return;
    add({ k: th.k, mode: 'buy', who: th.who, ag: th.ag, job: th.job, title: j.title, st: j.status, amt: th.amt, unread: th.unread });
  });
  s.orders.filter((o) => o.st < 4).forEach((o) => add({ k: o.buyer, mode: 'sell', who: o.buyer, job: o.id, title: o.title, st: O_ST[o.st], amt: o.price, order: o, unread: o.st === 0 }));
  return out;
}
/** True while a thread has news the user has not opened yet. */
export const isUnread = (t: Thread) => !!t.unread && (getState().live || !getState().seenThreads.includes(t.k));
/** Unread conversations across buying and selling; drives the Messages badges. */
export const unreadThreads = () => threads().filter(isUnread).length;
/** Mark a thread as read once it is opened. */
export function markSeen(k: string) {
  if (k && isLive()) { if (getState().liveThreads.some((t) => t.k === k && t.unread)) void liveReadThread(k); return; }
  if (k && !getState().seenThreads.includes(k)) setState((s) => ({ seenThreads: [...s.seenThreads, k] }));
}
/** Send a message in a non-demo thread. */
export function sendThread(raw: string) {
  const v = raw.trim(); const k = getState().thread;
  if (!v || !k) return;
  if (isLive()) { void liveSendThread(k, v); return; }
  const cur = threads().find((t) => t.k === k); if (!cur) return;
  const log: ChatMsg[] = [...cur.msgs, { from: 'me', text: v }];
  if (OFF_PLATFORM.test(v)) log.push({ from: 'sys', text: 'The fraud and lure agent flagged this message. Payment outside escrow is not protected.' });
  setState((s) => ({ tLog: { ...s.tLog, [k]: log } }));
  scrollMsgs();
}

/* ---------------- seller orders ---------------- */
const patchOrder = (id: string, p: Partial<Order>) => setState((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...p } : o)) }));
export const orderAct = {
  offer: (id: string) => openModal('offer', { id }),
  decline: (id: string) => { if (isLive()) { void liveOrderDecline(id); return; } setState((s) => ({ orders: s.orders.filter((o) => o.id !== id) })); toast('Request declined. The buyer can pick another seller.'); },
  accept: (id: string) => {
    if (isLive()) { void liveOrderAccept(id); return; }
    const o = getState().orders.find((x) => x.id === id)!;
    patchOrder(id, { st: 2, note: 'Buyer accepted. Tests locked, ' + o.price + ' USDC moved into Protected payment.' });
    toast(id + ' accepted. Payment protected, you can start.');
  },
  deliver: (id: string) => {
    if (isLive()) { openModal('deliver', { ref: id }); return; }
    const o = getState().orders.find((x) => x.id === id)!;
    patchOrder(id, { st: 3, note: 'Delivered commit a41c9e2. Reviewers are running the locked tests.' });
    toast('Delivery submitted. 3 reviewers are running the locked tests.');
    setTimeout(() => {
      patchOrder(id, { st: 4, note: 'Released after 2 of 3 approvals. Paid to your seller account.' });
      toast(<><b>{o.price} USDC released</b> for {id} after 2 of 3 approvals.</>);
    }, 2600);
  },
  /** The Send an offer form. */
  sendOffer: (id: string, priceText: string, days: string) => {
    if (isLive()) { void liveSendOffer(id, priceText, days).then((ok) => { if (ok) setState({ modal: null, oTab: 'active' }); }); return; }
    const o = getState().orders.find((x) => x.id === id); if (!o) return;
    const p = (priceText.match(/[\d.]+/) || ['42'])[0];
    const price = (+p).toFixed(2);
    const nid = 'J-' + getState().nextJob; setState((s) => ({ nextJob: s.nextJob + 1 }));
    patchOrder(id, { st: 1, id: nid, price, note: `Your offer: ${price} USDC in ${days}. The buyer accepts to lock the tests.` });
    setState({ modal: null, oTab: 'active' });
    toast('Offer sent to ' + o.buyer + '.');
  },
};

/* ---------------- tour ---------------- */
interface TourStep { r: string; st: number; t: string; p: string; d: ReactNode; act?: () => void }
export const TOUR: TourStep[] = [
  { r: 'home', st: 0, t: 'Meet AGORA', p: 'A marketplace for small code jobs where the tests decide when work is done. This demo follows one job from a sentence to a paid commit, then tries to break it.', d: <>Press <b>Next</b>, or sign in with Google.</> },
  { r: 'ask', st: 1, t: 'Ask your agent in plain words', p: 'New request is a chat. Buyers type the problem the way they would tell a colleague, or pick a popular service. No forms.', d: <>Pick a suggestion, or press <b>Next</b>.</>, act: () => setState({ asked: false, offerSt: '' }) },
  { r: 'ask', st: 1, t: 'Tests become the definition of done', p: 'The spec writer reads the repo and answers with tests that fail today. Nothing goes to sellers until the buyer locks them.', d: <>Click <b>Approve and lock the tests</b>.</>, act: () => setState((s) => ({ asked: true, askText: s.askText || JOB.plain, offerSt: '' })) },
  { r: 'ask', st: 3, t: 'Offers arrive, lowest price first', p: 'Matching sellers and bidding agents answer privately. The 2.00 USDC bait offer and the off-platform request are tagged Held by the fraud and lure agent, so nobody can choose them.', d: <>Look at the two <b>Held</b> rows at the top.</>, act: () => setState({ asked: true, offerSt: '', preNeg: false }) },
  { r: 'ask', st: 4, t: 'Your agent negotiates, you choose', p: 'It waited for 3 valid offers, then talked patchsmith down from 36.00 to 32.00, under the 35.50 median. The buyer can still choose any valid offer.', d: <>Click <b>Choose</b> on any offer.</>, act: () => setState({ asked: true, offerSt: '', preNeg: false }) },
  { r: 'chat', st: 4, t: 'The seller accepts in the chat room', p: 'The agent sends the hire offer for you and waits. Money locks only when the seller accepts, and each step lands as a timestamped card.', d: <>Click <b>Seller accepts, demo</b>.</>, act: () => setState((s) => ({ hire: s.hire || hb(s).key, offerSt: 'wait', thread: 'demo', inboxF: 'buy' })) },
  { r: 'jobs', st: 5, t: 'Job requests keep the record', p: 'Ongoing jobs come first as large cards with a node for each stage. Finished ones sit below. Filter pills pick a status in one tap.', d: <>Open <b>Activity</b> on the first card.</>, act: () => setState({ offerSt: 'accepted', jf: 'all' }) },
  { r: 'mandate', st: 5, t: 'The contract enforces the limits', p: 'Try something the limits forbid. The contract refuses a 400 USDC job because the per-job cap is 50.', d: <>Click <b>Fund 400 USDC job</b>.</> },
  { r: 'room', st: 5, t: 'Money waits in Protected payment', p: 'When the seller accepted, the transaction agent called fund_job. Nine checks passed and 32.00 USDC is held in escrow by the contract, not by AGORA or any agent.', d: <>Click <b>Simulate a bad delivery</b>.</> },
  { r: 'room', st: 6, t: 'A cheating delivery is rejected', p: 'The first commit edited the locked test to make it pass. All three reviewers rejected it and nothing was paid.', d: <>Click <b>Run review on this commit</b> for the real fix.</> },
  { r: 'room', st: 7, t: 'Two approvals release payment', p: 'Three reviewers on different models ran the tests in TEEs. After the second approval the contract released 32.00 USDC and minted a completion record.', d: <>Press <b>Next</b> to see the seller's record.</>, act: () => setState({ votes: [2, 2, 2] }) },
  { r: 'profile', st: 7, t: 'Reputation only from settled jobs', p: 'Record #412 and the review exist because money actually moved. Objective outcomes come first, ratings second.', d: '', act: () => setState((s) => ({ who: hb(s).name })) },
  { r: 'agents', st: 7, t: 'Someone steals the agent key', p: 'The attacker tries to drain the account. The protocol and the contract reject every call, and the guardian pauses the team.', d: <>Click <b>Run the drill</b>.</> },
  { r: 'sell', st: 7, t: 'Become a seller', p: 'Clicking Selling opens a short welcome, then a profile you can fill from LinkedIn, a CV or GitHub. The coding can be done by you or by a coding agent you run.', d: <>Click <b>Let's do this</b>.</>, act: () => setState({ sellStep: 0 }) },
  { r: 'dispute', st: 8, t: 'Disputes are a re-check first', p: "A dispute freezes the payment and 3 fresh reviewers re-run every test for free. Only if that doesn't settle it does the DAO vote, and the side that asks puts down a small bond it gets back if right.", d: <>Press <b>Next</b>.</> },
  { r: 'wallet', st: 8, t: 'A wallet that stays simple', p: 'One balance, four actions. Buyers add USDC from their own NEAR wallet, and agents can never withdraw.', d: <>That's the full loop. Press <b>Finish</b>.</> },
];
export function tourGo(i: number) {
  if (isLive()) { leaveLive(); toast('The demo tour uses sample data. Sign in again afterwards to see your own jobs.', 'hold'); }
  else if (getState().restoring) leaveLive(); /* the account was still loading: drop it, the tour needs the demo story */
  const s = TOUR[i];
  setState((st) => ({ tour: i, stage: s.st, attack: null, voting: false, role: s.st >= 1 && !st.role ? 'hire' : st.role, tourMin: false, modal: null }));
  s.act?.();
  if (s.st === 8) setState({ attack: { n: ATTACK.length } });
  go(s.r);
}
/**
 * The tour drives `stage` itself, up to 8, which the app treats as signed in to the sample account.
 * Remember who the visitor was when it started, and put that back when it ends, so a guest leaves as a guest.
 */
/* The whole app state when the tour started: everything done inside the demo is thrown away at the end. */
let beforeTour: State | null = null;
function startTour() {
  const s = getState();
  /* the tour's story is demo data from the backend */
  if (!demoLoaded()) {
    /* still loading: start once it arrives */
    if (!s.dataReady) { toast('Loading the demo…', 'hold'); void appDataLoaded().then(() => { if (demoLoaded() && getState().tour < 0) startTour(); else if (!demoLoaded()) toast('The demo could not be loaded. Check that the AGORA server is running, then try again.', 'block'); }); return; }
    toast('The demo could not be loaded. Check that the AGORA server is running, then try again.', 'block'); return;
  }
  if (s.tour < 0) beforeTour = { ...s };
  tourGo(0);
}
function endTour(finished: boolean) {
  const s = getState();
  /* no snapshot after a reload mid-tour (a real Google or GitHub sign-in): signed in only with a real
     account, and nothing the demo did is kept */
  const snap: Partial<State> = beforeTour ?? {
    stage: s.user ? 1 : 0, role: s.user ? s.role : null, signVia: s.user ? s.signVia : '', user: s.user,
    liked: [], newJobs: [], chatLog: {}, tLog: {}, seenThreads: [], thread: '', hire: '', who: '', votes: null,
    dTab: 'open', stars: 0, dReason: '', jobTab: 'bids',
  };
  beforeTour = null;
  const guest = (snap.stage ?? 0) < 1;
  setState({
    ...snap, tour: -1, tourMin: false, attack: null, voting: false, modal: null,
    /* settings and loading state belong to now, not to the snapshot; live data reloads below */
    dataReady: s.dataReady, fold: s.fold, live: false, liveJob: null, liveThreads: [], notes: { unread: 0, items: [] }, money: null,
  });
  resetRequest();
  if (guest) { go('home'); toast(finished ? 'Demo finished. Sign in to post your own job.' : 'Demo closed. You are not signed in.'); return; }
  if (snap.user && authConfigured) void goLive({ keepMode: true });

  if (finished) toast('Demo finished. Everything stays clickable.');
}
/* ---------------- New request: which conversation the page shows ---------------- */
/**
 * Clears the request conversation and the demo job's hire state, so New request opens on the empty composer.
 * For a new session: sign-in, sign-out and the end of the tour. Also stops offers still streaming in.
 * `keepDraft` keeps text typed into the composer before signing in.
 */
export function resetRequest(keepDraft = false) {
  setState((s) => ({
    asked: false, askText: '', draft: keepDraft ? s.draft : '', extra: [], bidsShown: 0, pendingAsk: false, followUps: [], liveSpec: { state: 'loading' },
    offerSt: '', preNeg: false, declined: [], streamId: s.streamId + 1,
  }));
}
/** New request from anywhere: the empty composer. The earlier job keeps its state and stays in Job requests. */
export function newRequest() {
  if (getState().tour >= 0) return; /* the tour drives this page itself */
  setState({ asked: false, draft: '', extra: [], followUps: [] });
}
/** Reopens the current job's conversation on New request, from its card or a "Back to the offers" link. */
export function openRequest() {
  setState({ asked: true });
}
/** Advance the tour when the visitor does what the current step asks. */
export const tourStep = (from: number, to: number) => { if (getState().tour === from) setState({ tour: to }); };

/** Send the hire offer to a seller from the offers list. */
export function hire(key: string) {
  const s = getState();
  if (s.stage < 3) return;
  if (s.live) { void liveHire(key).then((ok) => { if (ok) go('chat'); }); return; }
  setState({ preNeg: s.stage === 3 ? true : s.preNeg, stage: Math.max(s.stage, 4), hire: key, offerSt: 'wait', thread: 'demo', inboxF: 'buy' });
  go('chat');
  toast(`Your agent sent the hire offer to ${sellerBy(key)?.name ?? 'the seller'}.`);
  tourStep(4, 5);
}

/** Saves an onboarding answer for the signed-in account. Does nothing in the simulated demo. */
function remember(patch: Onboarding) {
  const u = getState().user; if (!u) return;
  const onboarding = { ...u.onboarding, ...patch };
  setState({ user: { ...u, onboarding } });
  void saveOnboarding(onboarding);
}
/** Sends the user to the home that fits what brings them here. */
function goRole(r: 'hire' | 'work') {
  if (r === 'hire') go('ask'); else { setState({ sellStep: 0 }); go(getState().seller ? 'seller' : 'sell'); }
}

/* ---------------- actions, the prototype's ACT table ---------------- */
export const act = {
  signin: () => openModal('signin'),
  code: () => openModal('code'),
  resend: () => {
    if (!authConfigured) { toast('A new code is on its way. The old one stops working.'); return; }
    void sendEmailCode(getState().mail).then((err) => toast(err ? `Could not send the code: ${err}` : 'A new code is on its way. The old one stops working.', err ? 'block' : 'ok'));
  },
  passkey: () => { setState({ signVia: 'passkey' }); toast('Passkey confirmed with your device. Nothing to remember.'); act.walletstep(); },
  walletstep: () => openModal('walletstep'),
  walletpick: () => openModal('walletpick'),
  /** `real`: a real wallet was linked and already said so; the demo picker passes a click event, not true. */
  walletlinked: (real?: unknown) => { setState({ walletLinked: true }); remember({ wallet: true }); if (real !== true) toast('Wallet linked. It can fund jobs; your agents still cannot withdraw.'); act.signin2(); },
  signsell: () => {
    if (getState().stage >= 1) { setState({ sellStep: 0 }); go('sell'); return; }
    setState({ after: 'sell', rolePick: 'work' }); openModal('signin');
  },
  /** Google, GitHub: account is ready, then offer to connect a wallet. Wallet: straight in. */
  signVia: (via: string) => {
    if ((via === 'google' || via === 'github') && authConfigured) { void act.oauth(via); return; }
    setState({ signVia: via }); if (via === 'wallet') act.signin2(); else act.walletstep();
  },
  /**
   * Real sign-in with a NEAR wallet alone: the backend checks the signed message, finds the account the wallet is
   * linked to (or makes one), and returns a one-time token that becomes a Supabase session. Returns an error or null.
   */
  walletSignIn: async (proof: OwnershipProof): Promise<string | null> => {
    const s = getState();
    savePending({ via: 'wallet', after: s.after, rolePick: s.rolePick, tour: s.tour, draft: s.draft });
    const res = await api<{ token_hash: string; created: boolean }>('/wallet/v1/sign-in', { body: proof, quiet: true }).catch((e: unknown) => e instanceof Error ? e : new Error('Could not sign in'));
    if (res instanceof Error) { takePending(); return res.message; }
    const err = await finishWalletSignIn(res.token_hash);
    if (err) { takePending(); return err; }
    return null;
  },
  /** Real Google or GitHub sign-in: remember where the user was, then leave for the provider's own page. */
  oauth: async (via: OAuthVia) => {
    const s = getState();
    savePending({ via, after: s.after, rolePick: s.rolePick, tour: s.tour, draft: s.draft });
    const err = await startOAuth(via);
    if (err) { takePending(); toast(`Could not reach ${via === 'google' ? 'Google' : 'GitHub'}: ${err}`, 'block'); }
  },
  signin2: () => {
    if (getState().tour < 0) { setState({ stage: 1 }); resetRequest(getState().after === 'ask'); }
    else setState((s) => ({ stage: Math.max(s.stage, 1) }));
    const u = getState().user;
    toast(!u ? `Signed in as ${ME.acct || 'your account'}. Agent sub-account created.` : u.isNew ? `Signed in as ${u.email || u.name}. Agent sub-account created.` : `Welcome back, ${u.name}.`);
    const s = getState();
    if (s.tour === 0) { closeModal(); tourGo(1); return; }
    const known = u?.onboarding.role;
    if (known) {
      setState({ role: known, after: null, modal: null });
      goRole(s.after === 'ask' ? 'hire' : s.after === 'sell' ? 'work' : known);
      return;
    }
    setState({ rolePick: s.after === 'sell' ? 'work' : s.after === 'ask' ? 'hire' : s.role });
    openModal('role');
  },
  rolepick: () => { setState((s) => ({ rolePick: s.role })); openModal('role'); },
  rolego: () => {
    const r = getState().rolePick; if (!r) return;
    setState({ role: r, after: null, modal: null });
    remember({ role: r });
    if (isLive()) void liveRole(r);
    goRole(r);
  },
  roleskip: () => { setState((s) => ({ role: s.role || 'hire', modal: null })); go('ask'); },
  signout: () => { leaveLive(); signOutRemote(); setState({ stage: 0, role: null, tour: -1, user: null, signVia: '' }); resetRequest(); go('home'); toast('Signed out.'); },
  /** Approve and lock the tests: offers then arrive one by one, lowest price first. */
  lockspec: () => {
    if (isLive()) { void liveLockSpec().then(() => tourStep(2, 3)); acScroll(); return; }
    const id = getState().streamId + 1;
    setState((s) => ({ stage: Math.max(s.stage, 2), bidsShown: 0, preNeg: false, streamId: id }));
    acScroll();
    toast('Tests locked. Spec hash 7c3e9a…91af stored. Sent privately to 9 matching sellers.');
    tourStep(2, 3);
    const tick = () => {
      const s = getState(); if (s.streamId !== id || s.stage >= 3) return;
      const n = s.bidsShown + 1;
      if (n >= ARRIVE.length) {
        setState({ bidsShown: n, stage: 3 }); acScroll();
        toast('2 offers held by the fraud and lure agent.', 'hold');
        setTimeout(() => { const t = getState(); if (t.streamId === id && t.stage === 3) { setState({ stage: 4 }); acScroll(); } }, 1500);
        return;
      }
      setState({ bidsShown: n }); acScroll();
      setTimeout(tick, 650);
    };
    setTimeout(tick, 700);
  },
  editspec: () => { const t = document.getElementById('ask-in') as HTMLTextAreaElement | null; if (t) { t.placeholder = 'Tell the spec writer what to change'; t.focus(); } },
  postpublic: () => isLive() ? void livePostPublic() : toast('J-1042 is now also on Open jobs. New offers join this list, lowest first.'),
  postpublic2: (xid: string) => {
    const s = getState(); const x = s.extra.find((e) => e.id === xid); if (!x) return;
    setState({
      extra: s.extra.map((e) => (e.id === xid ? { ...e, posted: true } : e)),
      newJobs: [{ id: x.id, title: x.text.length > 70 ? x.text.slice(0, 68) + '…' : x.text, cat: 'Code, to be tagged', budget: 'set by your agent', status: ['info', 'Posted publicly'], who: '', note: 'On Open jobs. Tests locked. Waiting for offers.', posted: true }, ...s.newJobs],
    });
    acScroll(); toast(`${x.id} posted on Open jobs.`);
  },
  newask: () => {
    window.scrollTo({ top: 0 });
    if (isLive()) { liveLeaveAsk(); toast('Started a new request. The last one is still in Job requests.'); return; }
    if (getState().stage < 2) { setState({ asked: false, askText: '', draft: '' }); return; }
    toast('The demo job keeps running. Type a new request below and your agent starts it separately.');
    requestAnimationFrame(() => document.getElementById('ask-in')?.focus());
  },
  discardask: () => {
    if (isLive()) { const job = getState().liveJob; if (!job?.id) { liveLeaveAsk(); return; } openModal('discard', { job: job.ref }); return; }
    setState({ asked: false, askText: '', draft: '' }); toast('Request discarded. Nothing was sent to sellers.');
  },
  discardask2: () => { closeModal(); void liveDiscardAsk(); },
  keepwait: () => isLive() ? void liveKeepWait() : toast('Your agent keeps the job private and checks again in 30 minutes.'),
  heroask: () => { const s = getState(); setState({ draft: s.q || '' }); if (s.stage >= 1) { go('ask'); return; } setState({ after: 'ask' }); act.signin(); },
  selleraccept: () => {
    if (isLive()) { toast('The seller accepts from their own Orders page. This screen updates when they answer.', 'hold'); return; }
    setState((s) => ({ offerSt: 'accepted', stage: Math.max(s.stage, 5) })); scrollMsgs();
    toast(<><b>{hb(getState()).name} accepted.</b> {hAmt()} USDC is now in Protected payment.</>);
    tourStep(5, 6);
  },
  sellerdecline: () => {
    if (isLive()) { toast('The seller answers from their own Orders page. This screen updates when they do.', 'hold'); return; }
    const s = getState();
    setState({ declined: s.declined.includes(s.hire) ? s.declined : [...s.declined, s.hire], offerSt: 'declined' }); scrollMsgs();
    toast(`${hb(s).name} declined. Nothing was locked.`, 'hold');
  },
  attachrepo: () => isLive() ? openModal('attachrepo') : toast(`In the demo the repository is ${JOB.repo} at ${JOB.base}.`),
  bids: () => { if (isLive()) { setState({ jobTab: 'bids' }); return; } setState((s) => ({ stage: Math.max(s.stage, 3), jobTab: 'bids' })); toast('2 offers held by the fraud and lure agent.', 'hold'); },
  negotiate: () => { if (isLive()) { setState({ jobTab: 'neg' }); toast('Pick an offer and your buyer agent sends the counter-offer in its chat.', 'hold'); return; } setState((s) => ({ stage: Math.max(s.stage, 4), jobTab: 'neg' })); toast('Your agent negotiated patchsmith down to 32.00 USDC. Choose any offer to hire.'); },
  fund: () => hire(getState().hire || hb(getState()).key),
  send: () => openModal('send'),
  receive: () => openModal('receive'),
  /** Live: real chain mode signs in the user's wallet; mock mode adds test USDC. Demo: explains where real funds come from. */
  addfunds: () => { if (isLive()) { if (walletMode()) openModal('walletmove', { op: 'deposit' }); else void liveAddFunds(); return; } toast('The demo uses sample money. Sign in with a NEAR wallet to add real testnet USDC from your wallet.', 'hold'); },
  dispute: () => openModal('dispute'),
  unpause: () => openModal('unpause'),
  overcap: () => toast(<><b>Rejected by contract.</b> fund_job 400.00 USDC is over your per-job cap of 50.00. 0 USDC moved.</>, 'block', 5200),
  wrongcat: () => toast(<><b>Rejected by contract.</b> Category "Design" is not on your allowed list.</>, 'block'),
  withdraw: () => toast(<><b>Rejected by NEAR.</b> The agent key has no permission to call withdraw.</>, 'block'),
  deletekey: () => toast('Deleting a key needs your full-access key. You would confirm with Google sign-in here.', 'hold'),
  withdrawme: () => isLive() ? (walletMode() ? openModal('walletmove', { op: 'withdraw' }) : void liveMockWithdraw()) : toast('Withdrawals need your full-access key. You would confirm with Google sign-in here.', 'hold'),
  send2: () => { closeModal(); toast('In the prototype nothing is sent. On testnet this is a full-access key transfer.', 'hold'); },
  copyacct: () => { try { void navigator.clipboard.writeText(ME.acct); } catch { /* ignore */ } toast(`Copied ${ME.acct}.`); },
  refundexp: () => toast("After the deadline, refund_expired returns the protected money to you. Anyone can call it, so it can't be blocked.", 'hold', 5200),
  baddeliver: () => { if (isLive()) { toast('Deliveries come from your seller. Reviewers run as soon as they submit a commit.', 'hold'); return; } setState((s) => ({ stage: Math.max(s.stage, 6) })); toast(<><b>Delivery rejected.</b> Commit 3b9c2aa edited a locked test. 0 of 3 approved.</>, 'block', 5200); },
  gooddeliver: () => {
    if (isLive()) { toast('Deliveries come from your seller. Reviewers run as soon as they submit a commit.', 'hold'); return; }
    setState((s) => ({ stage: s.stage < 6 ? 6 : s.stage, voting: true, votes: [1, 0, 0] }));
    const steps: [number, number[]][] = [[700, [1, 1, 0]], [1400, [2, 1, 1]], [2100, [2, 2, 1]]];
    steps.forEach(([ms, v]) => setTimeout(() => {
      setState({ votes: v });
      if (v[1] === 2) {
        setState({ stage: 7, voting: false });
        toast(<><b>{hAmt()} USDC released</b> to {hb(getState()).acct} after 2 of 3 approvals.</>);
        tourStep(9, 10);
      }
    }, ms));
    setTimeout(() => setState({ votes: [2, 2, 2] }), 3200);
  },
  placebid: () => {
    if (!getState().seller) { toast('Set up your seller profile first. It takes about 5 minutes.', 'hold'); go('sell'); return; }
    if (isLive()) { void livePlaceBid(); return; }
    toast('Bid sent. Your bidding agent priced it inside your rules: 3 attempts, delivery in 3 days.');
  },
  rate: () => {
    const n = getState().stars;
    if (!n) { toast('Pick 1 to 5 stars first.', 'hold'); return; }
    if (isLive()) { void liveRate(n); return; }
    toast(`${n} star${n > 1 ? 's' : ''} saved. The rating is tied to settled job J-1042.`);
  },
  /** The evidence bundle: spec, commits, test logs and votes in one JSON file. */
  bundle: () => {
    if (isLive()) { void liveBundle(); return; }
    const s = getState(); const H = hb(s);
    const data = {
      job: JOB.id, title: JOB.title, spec_hash: JOB.specHash, buyer: ME.acct, seller: H.acct, price_usdc: hAmt(), attempts_allowed: 3,
      deliveries: [{ attempt: 1, commit: '3b9c2aa', result: 'rejected 0 of 3', reason: 'edited the locked test' }, { attempt: 2, commit: 'e5f1d07', result: 'approved', tests: '31 of 31 pass' }],
      reviewers: REVIEWERS.map((r, i) => ({ id: r.id, model: r.model, attestation: r.att, log: '0x' + ['e3a1', '92cf', '5b07'][i] })),
      note: 'Sample evidence bundle from the AGORA prototype',
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `${JOB.id}-evidence.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Evidence bundle downloaded.');
  },
  dispute2: () => {
    if (!getState().dReason) { toast('Pick what went wrong first.', 'hold'); return; }
    if (isLive()) {
      const why = ((document.getElementById('d-why') as HTMLInputElement | null)?.value ?? '').trim();
      const reason = why ? `${getState().dReason}: ${why}` : getState().dReason;
      void liveOpenDispute(reason).then((ok) => { if (ok) closeModal(); });
      return;
    }
    closeModal(); toast('Payment frozen and the free re-check started. Here is how a full dispute looks, using example J-0977.', 'hold', 5200); go('dispute');
  },
  daovote: () => { if (isLive()) { void liveDisputeNext(); return; } setState({ dTab: 'ruled' }); toast('2 of 3 DAO votes. The contract split the payment 70/30.'); },
  attack: () => {
    setState({ attack: { n: 0 } });
    const tick = () => {
      const n = (getState().attack?.n ?? 0) + 1;
      setState({ attack: { n } });
      if (n >= ATTACK.length) { setState((s) => ({ stage: Math.max(s.stage, 8) })); toast(<><b>Guardian paused your agents.</b> 0.00 USDC moved.</>, 'block', 5200); return; }
      setTimeout(tick, 550);
    };
    setTimeout(tick, 550);
  },
  pause: () => { if (isLive()) { void livePause(); return; } setState((s) => ({ stage: Math.max(s.stage, 8) })); toast('All agents paused. Funding and release calls are stopped.', 'block'); },
  unpause2: () => { if (isLive()) { void liveUnpause().then((ok) => { if (ok) setState({ modal: null, attack: null }); }); return; } setState({ modal: null, stage: 7, attack: null }); toast('Key rotated. Agents are active again.'); },
  savemandate: () => { if (isLive()) { void liveSaveMandate(); return; } toast('Limits saved on-chain with your full-access key.'); },
  publishseller: () => {
    if (isLive()) { void livePublishSeller().then((ok) => { if (ok) { setState({ sellStep: 0 }); go('seller'); } }); return; }
    setState({ seller: true, sellStep: 0 }); go('seller'); toast(getState().sellCoder === 'agent' ? 'Seller profile published. Your bidding agent now bids on matching jobs.' : 'Seller profile published. Matching jobs show in Open jobs, and your bidding agent bids for you inside your rules.');
  },
  reqsvc: () => { if (getState().stage < 1) { act.signin(); return; } openModal('reqsvc'); },
  reqsvc2: (what: string) => {
    const s = getState(); const gg = gigBy(s.svc); if (!gg) return; const id = 'J-' + s.nextJob;
    const title = what || gg.prompt;
    if (s.live) { void liveRequestService(title, gg.id).then((ok) => { if (ok) { setState({ modal: null }); go('jobs'); } }); return; }
    setState({
      nextJob: s.nextJob + 1, modal: null,
      newJobs: [{ id, title: title.length > 70 ? title.slice(0, 68) + '…' : title, cat: gg.cat, budget: gg.from + '.00', status: ['info', 'Offered to ' + gg.seller], who: gg.seller, note: 'Waiting for the seller to accept. Escrow funds when they do.' }, ...s.newJobs],
    });
    go('jobs');
    toast(`${id} sent to ${gg.seller}. The spec writer is drafting the tests.`);
  },
  msgsvc: () => {
    const s = getState(); const gg = gigBy(s.svc); if (!gg) return;
    if (isLive()) {
      if (!gg.sellerId) { toast('This seller can not be messaged yet.', 'hold'); return; }
      void liveMessageSeller(gg.sellerId, gg.title).then((id) => { if (id) { setState({ thread: id, inboxF: 'buy' }); go('chat'); } });
      return;
    }
    const k = BIDS.find((b) => b.name === gg.seller)?.key;
    if (k && s.stage >= 5 && k === s.hire) { setState({ thread: 'demo' }); go('chat'); return; }
    toast(`Message sent to ${gg.seller}. Replies arrive in Messages.`);
  },
  /** The Buying / Selling switch in the sidebar and the account menu. */
  mode: (m: 'buy' | 'sell', route: string) => {
    const s = getState();
    if (s.mode === m && route !== 'home') return;
    setState({ mode: m }); go(m === 'sell' ? (s.seller ? 'orders' : 'sell') : 'dash');
    toast(m === 'sell' ? (s.seller ? 'Switched to selling. Orders buyers sent you are here.' : 'Switched to selling. Set up your seller profile to start getting orders.') : 'Switched to buying.');
  },
  fold: () => {
    // the page grows into the freed space, slid in with a FLIP transform
    const m0 = document.querySelector<HTMLElement>('.main'); const x0 = m0 ? m0.getBoundingClientRect().left : 0;
    const fold = !getState().fold; storage.set('agora-fold', fold ? '1' : '0');
    flushSync(() => setState({ fold }));
    const side = document.querySelector<HTMLElement>('.side');
    if (side && fold) {
      side.classList.add('hold'); (document.activeElement as HTMLElement | null)?.blur();
      side.addEventListener('mouseleave', () => side.classList.remove('hold'), { once: true });
    } else side?.classList.remove('hold');
    const m = document.querySelector<HTMLElement>('.main');
    if (!m || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dx = x0 - m.getBoundingClientRect().left; if (!dx) return;
    m.classList.remove('flip'); m.style.transform = `translateX(${dx}px)`; m.getBoundingClientRect();
    m.classList.add('flip'); m.style.transform = '';
    m.addEventListener('transitionend', () => m.classList.remove('flip'), { once: true });
  },
  like: (id: string) => {
    if (isLive()) { void liveLike(id); return; }
    const s = getState();
    if (s.liked.includes(id)) setState({ liked: s.liked.filter((x) => x !== id) });
    else { setState({ liked: [...s.liked, id] }); toast(`Saved ${gigBy(id)?.seller ?? 'this seller'}. Your buyer agent will ask them first on matching jobs.`); }
  },
  openGig: (id: string) => { if (isLive()) void liveOpenGig(id); setState({ svc: id }); go('svc'); tourStep(1, 2); },
  /** A seller's name anywhere opens their profile. */
  who: (key: string) => { if (isLive()) void liveWho(key); setState({ who: key }); go('profile'); },
  /** Links Google or GitHub to the signed-in account. In the demo (no real sign-in) GitHub just shows as connected. */
  linkid: (via: OAuthVia) => {
    if (!authConfigured || !getState().user) {
      if (via === 'github') { setState({ ghLinked: true }); toast('GitHub connected: 14 public repositories found. Reputation still comes only from settled jobs.'); }
      else toast('Sign in first.', 'hold');
      return;
    }
    void linkProvider(via).then((err) => { if (err) toast(err, 'block'); });
  },
  unlinkid: (via: OAuthVia) => {
    void unlinkProvider(via).then((err) => {
      if (err) { toast(err, 'block'); return; }
      toast(`${via === 'github' ? 'GitHub' : 'Google'} removed from this account.`);
    });
  },
  ghconnect: () => act.linkid('github'),
  sellstart: () => { if (isLive()) void liveLoadSellProfile(); setState({ sellStep: 1 }); window.scrollTo(0, 0); },
  theme: () => {
    const r = document.documentElement;
    const cur = r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', nx); storage.set('agora-theme', nx);
  },
  tour: () => startTour(),
  tournext: () => {
    const t = getState().tour;
    if (t >= TOUR.length - 1) { endTour(true); return; }
    tourGo(t + 1);
  },
  tourback: () => { const t = getState().tour; if (t > 0) tourGo(t - 1); },
  tourend: () => endTour(false),
  /** Hero search: signed in, it drafts a request; signed out, it searches services. */
  heroGo: (v: string, focusInput: () => void) => {
    if (!v) { toast('Type what you need first, or pick a suggestion.', 'hold'); focusInput(); return; }
    if (getState().stage >= 1) { setState({ draft: v }); go('ask'); return; }
    setState({ q: v, fromHero: v, f: {}, exTab: 'services' }); go('explore');
  },
  /** The New request composer: the first message starts the chat; later ones ask the agent about a new job. */
  submitAsk: (v: string) => {
    if (!v) { toast('Describe the job first, or pick a popular service.', 'hold'); return; }
    const s = getState();
    if (s.stage < 1) { setState({ draft: v, after: 'ask' }); act.signin(); return; }
    if (s.live) { requestAnimationFrame(acScroll); void liveSend(v).then(() => acScroll()); return; }
    setState({ draft: '' });
    if (!s.asked && s.stage < 2) { setState({ asked: true, askText: v }); acScroll(); tourStep(1, 2); return; }
    if (s.stage < 2) { toast('The spec writer will fold that into the tests before you lock them.'); return; }
    setState({ nextJob: s.nextJob + 1, extra: [...s.extra, { id: 'J-' + s.nextJob, text: v, t: clock(), posted: false }] });
    acScroll();
  },
  /** Email sign-in: real Supabase one-time code when sign-in is configured, simulated in the prototype. Returns an error or null. */
  signMail: async (v: string): Promise<string | null> => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'Enter an email address, like you@example.com.';
    if (authConfigured) {
      const err = await sendEmailCode(v);
      if (err) return `Could not send the code: ${err}`;
    }
    setState({ signVia: 'email', mail: v }); act.code();
    return null;
  },
  signCode: async (v: string): Promise<string | null> => {
    const code = v.replace(/\D/g, '');
    if (code.length < 6 || code.length > 10) return 'Enter the code from the email.';
    if (!authConfigured) { act.walletstep(); return null; }
    const s = getState();
    savePending({ via: 'email', after: s.after, rolePick: s.rolePick, tour: s.tour, draft: s.draft });
    const err = await verifyEmailCode(s.mail, code);
    if (err) { takePending(); return err.toLowerCase().includes('expired') || err.toLowerCase().includes('invalid') ? 'That code is wrong or expired. Check the newest email, or resend.' : err; }
    return null;
  },
};

/* ---------------- real sign-in session ---------------- */
/**
 * Call once at startup. Picks up the session Supabase creates after the Google or GitHub redirect,
 * resumes the sign-in flow the user started, and keeps the app signed in across reloads.
 */
let syncedGithub: string | null | undefined;
export function initAuth(): () => void {
  const urlError = takeUrlError();
  const linking = takeLinking();
  if (urlError) { takePending(); toast(linking ? linkErrorText(urlError, linking) : `Sign-in was not completed: ${urlError}`, 'block'); }
  else if (linking) setTimeout(() => { const id = getState().ids[linking]; if (id) toast(`${linking === 'github' ? 'GitHub' : 'Google'} linked: ${id}. It now opens this same account.`); }, 1500);
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { leaveLive(); syncedGithub = undefined; setState({ user: null, ids: NO_IDS, ghLinked: false }); return; }
    if (session) {
      const ids = linkedIdsOf(session);
      setState({ ids, ghLinked: Boolean(ids.github) });
      /* the seller profile shows the GitHub linked to this account, read by the server from Supabase */
      if (ids.github !== syncedGithub) { syncedGithub = ids.github; setTimeout(() => { void api('/seller-profile/v1/github', { method: 'POST', quiet: true }).catch(() => null); }, 0); }
    }
    /* a saved Google or GitHub sign-in whose Supabase session has expired: back to guest */
    if (event === 'INITIAL_SESSION' && !session && getState().user) { setState({ stage: 0, user: null, role: null, signVia: '' }); stopRestoring(); return; }
    if (!session || (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION')) return;
    const user = userOf(session);
    setTimeout(() => {
      const pending = takePending();
      if (pending) {
        setState({ user, signVia: pending.via, after: pending.after, rolePick: pending.rolePick, tour: pending.tour, draft: pending.draft });
        /* back from Google or GitHub: never show the demo account while this account loads */
        beginRestoring();
        if (user.onboarding.wallet) act.signin2(); else act.walletstep();
        void goLive();
        return;
      }
      const fresh = getState().user?.id !== user.id && getState().tour < 0;
      /* Supabase also sends SIGNED_IN when a tab regains focus: the same user, already live, needs nothing */
      if (!fresh && event === 'SIGNED_IN' && getState().live) return;
      setState((s) => ({ user, signVia: s.signVia || user.via, stage: fresh ? 1 : Math.max(s.stage, 1), role: s.role || user.onboarding.role || null }));
      if (fresh) resetRequest();
      /* a reload or a tab coming back keeps the mode this device shows; another account uses its own */
      if (getState().tour < 0) { beginRestoring(); void goLive({ keepMode: !fresh }); }
    }, 0);
  });
  return () => data.subscription.unsubscribe();
}
