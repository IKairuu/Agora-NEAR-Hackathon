import { ARRIVE, BIDS, DAO_COUNCIL, DONE_JOBS, NEG_LOG, SETTLED, GIGS, HELD, JOB, JOB_LISTING, KICKOFF, ME, OPEN_JOBS, OTHER_JOBS, REPLIES, REVIEWERS, SELLERS_DIR, SPEC, T_MSGS, T_TIME, THREADS, gigBy, liveOpenRef, setLiveOpenJobs, type Bid, type DemoData, type Gig, type OpenJob, type Order, type OtherJob, type SellerDir } from '../data/data';
import type { ChatMsg } from '../store/store';
import { DEMO_SELL_FORM, EMPTY_SELL_FORM, getState, setState, subscribe, toast, type FollowUp, type SellForm, type LiveNote, type LiveSpec, type SpecDoc } from '../store/store';
import type { Thread } from '../store/actions';
import { api, ApiError } from './api';

/*
 * All data comes from the backend. The screens read the shared objects in data/data.ts directly:
 * - at startup, loadAppData fills the market (services, sellers, open jobs) from its public endpoints,
 *   and the "Play demo" story from GET /api/demo/v1;
 * - live mode (a real account is signed in and the API answers) copies the account's data into the
 *   same objects, and the demo story is put back when the user signs out or starts the demo tour.
 */

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The demo story as the backend sent it; null until loaded or when the backend could not be reached. */
let DEMO: DemoData | null = null;
export const demoLoaded = () => DEMO !== null;

/*
 * Demo and live data never mix:
 * - every live session gets a new number; leaving it (sign-out, the demo tour) moves the number on,
 *   so a request still in flight from the old session is dropped instead of writing into the demo;
 * - going live empties every demo-only container, and leaving live puts the demo story back.
 */
let session = 0;
class StaleSession extends Error {}
const stale = (s: number) => s !== session;
/** An API call made for the live session: rejects if that session ended before the answer came back. */
async function liveApi<T>(path: string, opts: Parameters<typeof api>[1] = {}): Promise<T> {
  const s = session;
  const res = await api<T>(path, opts);
  if (stale(s)) throw new StaleSession();
  return res;
}
let likedBefore: string[] | null = null;
const replace = <T,>(target: T[], items: T[]) => { target.splice(0, target.length, ...items); };

interface MeView { id: string; name: string; acct: string; agents: string; initials: string; email: string; role: 'hire' | 'work' | null; mode: 'buy' | 'sell'; seller: boolean }
interface JobView { id: string; uuid: string; title: string; repo: string; base: string; cat: string; plain: string; posted: string; specHash: string; specLocked: boolean; budget: string; stage: string; status: [string, string]; offers: number; remove?: 'delete' | 'cancel' | null }

/* ---- delete or cancel a job: the API says which one a job allows, and checks it again when asked ---- */
const REMOVAL: Record<string, 'delete' | 'cancel' | null> = {};
/** Whether the signed-in buyer can delete (a draft) or cancel (an open job) this job; null when neither. */
export const removalFor = (ref: string): 'delete' | 'cancel' | null => (isLive() ? REMOVAL[ref] ?? null : null);
type SpecView = SpecDoc;
/** Shown for a job that has no repository yet; the spec writer needs one to write tests. */
export const NO_REPO = 'No repository attached yet';
/** The followed job's budget as the job API shows it (empty when none was given). */
export const JOB_BUDGET = { label: '' };
/* whether the spec writer workflow is connected on this server (GET /agents/v1), asked once per session */
let agentsOn: { session: number; on: boolean | null } | null = null;
async function specWriterConnected(): Promise<boolean | null> {
  if (agentsOn?.session === session) return agentsOn.on;
  const s = session;
  const res = await api<{ connected?: boolean }>('/agents/v1', { quiet: true }).catch(() => null);
  const on = typeof res?.connected === 'boolean' ? res.connected : null;
  if (s === session) agentsOn = { session: s, on };
  return on;
}
async function specState(spec: SpecView | null, hasRepo: boolean): Promise<LiveSpec> {
  if (spec) return { state: spec.locked ? 'locked' : 'draft', doc: spec };
  return { state: 'none', repo: hasRepo, agents: hasRepo ? await specWriterConnected() : null };
}
type OfferView = Bid & { bidId: string };
interface HeldView { bidId: string; name: string; acct: string; kind: 'agent' | 'human'; price: number; fraud: number; why: string; text: string }
interface OffersView { offers: OfferView[]; held: HeldView[]; bestPick: string | null; waitingFor: number }
interface HireOfferView { id?: string; offerSt: '' | 'wait' | 'accepted' | 'declined'; seller?: string; bidId?: string | null }
interface OpenJobView { id: string; title: string; cats: string; budget: string; check: string; bids: number; buyer: string; blurb: string; buyerRating: string; minutesAgo: number }
interface ThreadView { id: string; title: string; with: string; side: 'buy' | 'sell'; jobId: string | null; last: string; time: string }
interface MessageView { id: string; from: ChatMsg['from']; text: string }
type LiveOrder = Order & { bidId?: string; hireOfferId?: string };

const shortHash = (h: string) => (h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);
export const isLive = () => getState().live;

/** The job's stage name from the API as the frontend's demo stage number, so screen logic keeps working. */
export function stageNumber(job: Pick<JobView, 'stage' | 'offers'>): number {
  switch (job.stage) {
    case 'Requested': return 1;
    case 'Offers': return job.offers > 0 ? 3 : 2;
    case 'Agreed': return 4;
    case 'Protected': case 'Delivered': case 'Reviewed': case 'Disputed': return 5;
    case 'Released': case 'Settled': return 7;
    default: return 1;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/*
 * Buying or Selling is the user's choice and is saved on the account (PATCH /me/v1 { mode }) whenever it changes
 * in a live session, from the sidebar switch or from a screen that belongs to one side (Open jobs, an open job).
 * The account's value is only used when nothing on this device knows the user's mode yet (see goLive).
 */
let savedMode: 'buy' | 'sell' | null = null;
subscribe(() => {
  const s = getState();
  if (!s.live || s.tour >= 0 || savedMode === null || s.mode === savedMode) return;
  const mode = s.mode;
  savedMode = mode;
  void api('/me/v1', { method: 'PATCH', body: { mode }, quiet: true }).catch(() => { if (savedMode === mode) savedMode = null; });
});

/**
 * Called after a real sign-in. Stays in demo mode if the API cannot be reached.
 * `keepMode`: this device already shows this user (a reload, a tab coming back, the end of the demo tour), so their
 * current Buying or Selling stays; without it (a new sign-in) the mode saved on the account is used.
 */
export async function goLive(opts: { keepMode?: boolean } = {}): Promise<void> {
  const s = ++session;
  let me: MeView;
  try { me = await api<MeView>('/me/v1', { quiet: true }); } catch (e) {
    if (e instanceof ApiError && e.status !== 0) toast(e.message, 'block');
    /* the saved account could not be loaded: show the demo story, as before, instead of waiting forever */
    if (!stale(s)) stopRestoring();
    return;
  }
  if (stale(s)) return;
  if (likedBefore === null) likedBefore = getState().liked;
  clearDemo();
  Object.assign(ME, { name: me.name, acct: me.acct, agents: me.agents, initials: me.initials, email: me.email });
  const mode = opts.keepMode ? getState().mode : me.mode === 'sell' ? 'sell' : 'buy';
  /* the account learns a mode kept from this device only if it differs (savedMode = what the server has) */
  savedMode = me.mode === 'sell' ? 'sell' : 'buy';
  setState((s) => ({ live: true, restoring: false, sellForm: { ...EMPTY_SELL_FORM, name: me.name }, sellLoaded: false, seller: me.seller, role: s.role ?? me.role, mode, orders: [], newJobs: [], extra: [], tLog: {}, chatLog: {} }));
  await Promise.allSettled([loadMarket(), loadSaved()]);
  await refreshAll(true);
  if (!timer) timer = setInterval(() => { void refreshAll(false); }, 8000);
}

/**
 * A real account is signing in or being restored (a reload, the page Google or GitHub sends the user back to):
 * hide the demo story and show "Loading your account" until goLive has the account's data, or gives up.
 */
export function beginRestoring(): void {
  if (isLive() || getState().tour >= 0) return;
  clearDemo();
  setState({ restoring: true });
}

/** The saved account is not coming (signed out, server unreachable, demo tour): fill in the demo story after all. */
export function stopRestoring(): void {
  if (!getState().restoring) return;
  setState({ restoring: false });
  if (!isLive()) restoreDemo();
}

/** Empties every container the demo story fills, so a real account sees only its own data. */
function clearDemo(): void {
  Object.assign(ME, { name: '', acct: '', agents: '', initials: '', email: '' });
  Object.assign(JOB, { id: '', title: '', repo: '', base: '', cat: '', plain: '', posted: '', specHash: '' });
  Object.assign(JOB_LISTING, { budget: '', check: '', blurb: '', buyerRating: '' });
  Object.assign(SETTLED, { record: '', title: '', reviewer: '', review: '' });
  for (const list of [SPEC, OTHER_JOBS, DONE_JOBS, BIDS, HELD, ARRIVE, REVIEWERS, NEG_LOG, DAO_COUNCIL, THREADS] as unknown[][]) replace(list, []);
  for (const rec of [REPLIES, KICKOFF, T_MSGS, T_TIME] as Record<string, unknown>[]) for (const k of Object.keys(rec)) delete rec[k];
}

/** Puts the demo story into the shared objects, or empties them when there is none. */
function restoreDemo(): void {
  clearDemo();
  const d = DEMO ? clone(DEMO) : null;
  if (d) {
    Object.assign(JOB_LISTING, d.jobListing); Object.assign(SETTLED, d.settled);
    Object.assign(REPLIES, d.replies); Object.assign(KICKOFF, d.kickoff, { '': d.kickoffDefault });
    Object.assign(T_MSGS, d.threadMessages); Object.assign(T_TIME, d.threadTimes);
    replace(THREADS, d.threads); replace(NEG_LOG, d.negotiationLog); replace(DAO_COUNCIL, d.daoCouncil);
  }
  Object.assign(ME, d?.me ?? { name: '', acct: '', agents: '', initials: '', email: '' });
  Object.assign(JOB, d?.job ?? { id: '', title: '', repo: '', base: '', cat: '', plain: '', posted: '', specHash: '' });
  replace(SPEC, d?.spec ?? []); replace(OTHER_JOBS, d?.otherJobs ?? []); replace(DONE_JOBS, d?.doneJobs ?? []);
  replace(BIDS, d?.bids ?? []); replace(HELD, d?.held ?? []); replace(ARRIVE, d?.arrive ?? []); replace(REVIEWERS, d?.reviewers ?? []);
  setState({ orders: d?.orders ?? [] });
}

/**
 * Called once at startup, signed in or not: loads the public market and the demo story.
 * When the backend cannot be reached everything stays empty and the screens show their empty states.
 */
let appData: Promise<void> | null = null;
/** Resolves when the startup load has finished; starts it if it has not run yet. */
export const appDataLoaded = (): Promise<void> => appData ?? loadAppData();
export function loadAppData(): Promise<void> {
  appData ??= loadAll();
  return appData;
}
async function loadAll(): Promise<void> {
  const [demo] = await Promise.all([
    api<DemoData>('/demo/v1', { quiet: true }).catch(() => null),
    loadMarket(),
    loadPublicOpenJobs(),
  ]);
  if (demo) {
    DEMO = demo;
    /* a real sign-in may already have filled the shared objects with the account's own data, or be on its way */
    if (!isLive() && !getState().restoring) restoreDemo();
  }
  setState({ dataReady: true });
}

/** Open jobs any visitor can see. Signed in, loadOpenJobs replaces them with the account's view. */
async function loadPublicOpenJobs(): Promise<void> {
  const rows = await api<OpenJobView[]>('/open-jobs/v1', { quiet: true }).catch(() => null);
  replace(OPEN_JOBS, (rows ?? []).map((j): OpenJob => [j.title, j.cats, j.budget, j.check, j.bids, j.buyer, true, j.blurb, j.buyerRating, j.minutesAgo]));
}

/** Leaves live mode and puts the demo story back. The market stays: it is the same public data. */
export function leaveLive(): void {
  session++;
  savedMode = null;
  agentsOn = null;
  if (timer) { clearInterval(timer); timer = null; }
  restoreDemo();
  setState({ restoring: false, sellForm: DEMO_SELL_FORM, sellLoaded: false });
  setLiveOpenJobs(null);
  if (likedBefore !== null) { setState({ liked: likedBefore }); likedBefore = null; }
  setState((s) => (gigBy(s.svc) ? {} : { svc: GIGS[0]?.id ?? s.svc }));
  setState({ live: false, liveJob: null, liveThreads: [], notes: { unread: 0, items: [] }, money: null });
}

async function refreshAll(first: boolean): Promise<void> {
  if (!isLive()) return;
  await Promise.allSettled([loadJobs(first), loadOrders(), loadNotes(), loadOpenJobs(), loadThreads(), loadMoney()]);
  await loadCurrentJob();
  setState({});
}

async function loadJobs(adopt: boolean): Promise<void> {
  const jobs = await liveApi<(OtherJob & { grp: string })[]>('/jobs/v1', { quiet: true });
  for (const k of Object.keys(REMOVAL)) delete REMOVAL[k];
  for (const j of jobs) REMOVAL[j.id] = j.remove ?? null;
  if (adopt && !getState().liveJob) {
    const current = jobs.find((j) => ['offers', 'waiting', 'working'].includes(j.grp));
    if (current) setState({ liveJob: { id: '', ref: current.id } });
  }
  const followed = getState().stage >= 2 ? getState().liveJob?.ref : undefined;
  replace(OTHER_JOBS, jobs.filter((j) => !['done', 'disputed'].includes(j.grp) && j.id !== followed).map((j) => ({ ...j, href: undefined })));
  replace(DONE_JOBS, jobs.filter((j) => ['done', 'disputed'].includes(j.grp)));
}

async function loadCurrentJob(): Promise<void> {
  const ref = getState().liveJob?.ref;
  if (!ref) return;
  const sid = session;
  const job = await liveApi<JobView>(`/jobs/v1/${ref}`, { quiet: true }).catch(() => null);
  if (!job) return;
  REMOVAL[job.id] = job.remove ?? null;
  Object.assign(JOB, { id: job.id, title: job.title, repo: job.repo || NO_REPO, base: job.base || 'main', cat: job.cat, plain: job.plain, posted: job.posted, specHash: job.specHash ? shortHash(job.specHash) : '' });
  JOB_BUDGET.label = job.budget;
  const spec = await liveApi<SpecView>(`/specs/v1?job=${ref}`, { quiet: true }).catch(() => null);
  if (stale(sid)) return;
  replace(SPEC, spec ? spec.rows : [['Tests are being written', 'The spec writer drafts failing tests from your repository', 'Pending']]);
  const liveSpec = await specState(spec, !!job.repo);
  if (stale(sid) || getState().liveJob?.ref !== ref) return;
  setState({ liveSpec });
  const stage = stageNumber(job);
  if (stage >= 2) await loadOffers(ref);
  if (stage >= 5) await loadReviews(ref);
  const offer = stage >= 2 ? await liveApi<HireOfferView>(`/negotiations/v1/offer?job=${ref}`, { quiet: true }).catch(() => null) : null;
  if (stale(sid)) return;
  setState((s) => {
    const hired = offer?.bidId ? BIDS.find((b) => (b as OfferView).bidId === offer.bidId)?.key : undefined;
    return {
      liveJob: { id: job.uuid, ref: job.id },
      askText: s.askText || job.plain,
      stage: Math.max(stage, offer?.offerSt === 'wait' ? 4 : stage),
      bidsShown: ARRIVE.length,
      offerSt: offer?.offerSt ?? s.offerSt,
      hire: hired ?? s.hire,
    };
  });
}

interface ReviewPanelView {
  deliveryId: string | null;
  reviewers: { id: string; model: string; att: string; state: number }[];
}

async function loadReviews(ref: string): Promise<void> {
  const res = await liveApi<ReviewPanelView>(`/reviews/v1?job=${ref}`, { quiet: true }).catch(() => null);
  if (!res?.deliveryId) return;
  replace(REVIEWERS, res.reviewers.map((r) => ({ id: r.id, model: r.state === 3 ? `${r.model} · rejected` : r.model, att: r.att })));
  const votes = res.reviewers.map((r) => (r.state === 3 ? 0 : r.state));
  setState({ votes, voting: votes.includes(1) });
}

/** Downloads the evidence bundle for the followed job. */
export async function liveBundle(): Promise<void> {
  const ref = getState().liveJob?.ref;
  if (!ref) { toast('Open a job first.', 'hold'); return; }
  const data = await api<unknown>(`/reviews/v1/evidence?job=${ref}`).catch(() => null);
  if (!data) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `agora-evidence-${ref}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Evidence bundle downloaded.');
}

async function loadOffers(ref: string): Promise<void> {
  const res = await liveApi<OffersView>(`/bids/v1?job=${ref}`, { quiet: true }).catch(() => null);
  if (!res) return;
  replace(BIDS, res.offers);
  replace(HELD as unknown as HeldView[], res.held);
  replace(ARRIVE, [...res.held.map((h) => h.name), ...res.offers.map((o) => o.key)]);
}

async function loadOrders(): Promise<void> {
  if (!getState().seller) return;
  const orders = await liveApi<LiveOrder[]>('/orders/v1', { quiet: true });
  setState({ orders });
}

async function loadNotes(): Promise<void> {
  const res = await liveApi<{ unread: number; items: LiveNote[] }>('/notifications/v1', { quiet: true });
  setState({ notes: res });
}

async function loadOpenJobs(): Promise<void> {
  const rows = await liveApi<OpenJobView[]>('/open-jobs/v1', { quiet: true });
  const jobs = rows.map((j): OpenJob => [j.title, j.cats, j.budget, j.check, j.bids, j.buyer, true, j.blurb, j.buyerRating, j.minutesAgo]);
  setLiveOpenJobs({ jobs, refs: rows.map((j) => j.id) });
}

async function loadThreads(): Promise<void> {
  const sid = session;
  const rows = await liveApi<ThreadView[]>('/threads/v1', { quiet: true });
  const out: Thread[] = [];
  for (const t of rows.slice(0, 20)) {
    const msgs = await api<MessageView[]>(`/threads/v1/${t.id}/messages`, { quiet: true }).catch(() => [] as MessageView[]);
    out.push({ k: t.id, mode: t.side, who: t.with, job: t.jobId ?? '', title: t.title, st: ['', t.side === 'buy' ? 'Buying' : 'Selling'], amt: '', last: t.last, time: t.time, msgs: msgs.map((m) => ({ from: m.from, text: m.text })) });
  }
  if (stale(sid)) return;
  setState({ liveThreads: out });
}

/* ---------------- live versions of the actions ---------------- */

/** Why a message could not be sent, for the toast. The text stays in the composer either way. */
const notSent = (e: unknown) => (e instanceof ApiError && e.status !== 0
  ? `Not sent: ${e.message}. Your text is still in the box.`
  : 'Could not reach the AGORA server. Your text is still in the box, so try again in a moment.');
const hhmm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/**
 * Sends what the user typed in New request. The first message of an empty request creates the job;
 * every later message in the same thread is about that job and never creates another one.
 * The composer text is cleared only once the API accepted it.
 */
export async function liveSend(text: string): Promise<boolean> {
  const s = getState();
  return s.asked && s.liveJob ? liveFollowUp(text) : liveSubmitAsk(text);
}

/** First message: shows at once, then creates exactly one job and follows it. */
export async function liveSubmitAsk(text: string): Promise<boolean> {
  setState({ asked: true, askText: text, pendingAsk: true, liveJob: null, followUps: [] });
  let res: { id: string; ref: string };
  try { res = await api<{ id: string; ref: string }>('/requests/v1', { body: { text }, quiet: true }); }
  catch (e) { setState({ asked: false, askText: '', pendingAsk: false }); toast(notSent(e), 'block', 6000); return false; }
  /* show the new job, not the previous one, until its details load */
  Object.assign(JOB, { id: res.ref, title: text, repo: NO_REPO, base: 'main', cat: '', plain: text, posted: 'just now', specHash: '' });
  JOB_BUDGET.label = '';
  replace(SPEC, [['Tests are being written', 'The spec writer drafts failing tests from your repository', 'Pending']]);
  setState({ liveJob: { id: res.id, ref: res.ref }, pendingAsk: false, draft: '', stage: 1, offerSt: '', preNeg: false, declined: [], bidsShown: 0, liveSpec: { state: 'loading' } });
  toast(`${res.ref} created.`);
  await refreshAll(false);
  return true;
}

/**
 * A later message in the same thread. Before the tests are locked it is a clarification, saved on the
 * job's request for the spec writer; after that the job can no longer change, and the agent says so.
 */
async function liveFollowUp(text: string): Promise<boolean> {
  const s = getState();
  const ref = s.liveJob?.ref ?? JOB.id;
  const id = `f${Date.now()}`;
  const update = (patch: Partial<FollowUp>) => setState((x) => ({ followUps: x.followUps.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  setState((x) => ({ followUps: [...x.followUps, { id, text, t: hhmm(), sending: true }] }));
  if (s.stage >= 2) {
    update({ sending: false, reply: `The tests for ${ref} are locked, so this job can't change any more. To get something else built, start a New request.` });
    setState({ draft: '' });
    return true;
  }
  const uuid = s.liveJob?.id;
  try {
    if (!uuid) throw new ApiError(`${ref} is still being set up`, 409);
    await api('/requests/v1', { method: 'PATCH', body: { id: uuid, text: `${JOB.plain}\n\n${text}` }, quiet: true });
  } catch (e) {
    setState((x) => ({ followUps: x.followUps.filter((f) => f.id !== id) }));
    toast(notSent(e), 'block', 6000);
    return false;
  }
  JOB.plain = `${JOB.plain}\n\n${text}`;
  update({ sending: false, reply: `Noted. I added this to ${ref} for the spec writer. The tests can still change until you lock them.`, link: true });
  setState({ draft: '' });
  return true;
}

/**
 * Deletes a draft or cancels an open job. The API refuses jobs that are agreed or funded and other users' jobs,
 * and its message is shown as a toast. A job the New request chat follows is let go of, so the chat starts empty.
 */
export async function liveRemoveJob(ref: string, kind: 'delete' | 'cancel'): Promise<boolean> {
  try {
    if (kind === 'delete') await api(`/jobs/v1/${ref}`, { method: 'DELETE' });
    else await api('/jobs/v1/cancel', { body: { id: ref } });
  } catch { await refreshAll(false); return false; }
  REMOVAL[ref] = null;
  if (getState().liveJob?.ref === ref) {
    Object.assign(JOB, { id: '', title: '', repo: '', base: '', cat: '', plain: '', posted: '', specHash: '' });
    setState({ liveJob: null, asked: false, askText: '', pendingAsk: false, followUps: [], liveSpec: { state: 'loading' }, stage: 1, offerSt: '', preNeg: false, declined: [], bidsShown: 0, hire: '' });
  }
  toast(kind === 'delete' ? `Draft ${ref} deleted.` : `${ref} cancelled. It is no longer on Open jobs and stays in your history.`);
  await refreshAll(false);
  return true;
}

export async function liveLockSpec(): Promise<void> {
  const ref = getState().liveJob?.ref; if (!ref) return;
  const spec = await api<SpecView>(`/specs/v1?job=${ref}`, { quiet: true }).catch(() => null);
  if (!spec) { toast('The spec writer has not drafted tests for this job yet. Try again in a minute.', 'hold'); return; }
  /* lock only the draft the user is looking at: if the spec writer replaced it meanwhile, show the new one first */
  const shown = getState().liveSpec;
  if (shown.state === 'draft' && shown.doc.id !== spec.id) { setState({ liveSpec: { state: 'draft', doc: spec } }); toast('The spec writer updated the tests. Check the new draft, then lock it.', 'hold'); return; }
  let hash = spec.specHash ?? '';
  if (!spec.locked) {
    const locked = await api<{ specHash: string }>('/specs/v1/lock', { body: { id: spec.id } }).catch(() => null);
    if (!locked) return;
    hash = locked.specHash;
  }
  const posted = await api<{ ref: string }>('/jobs/v1/publish', { body: { id: ref } }).catch(() => null);
  if (!posted) return;
  setState((s) => ({ stage: Math.max(s.stage, 2) }));
  toast(`Tests locked. Spec hash ${shortHash(hash)} stored. ${ref} is open for offers.`);
  await refreshAll(false);
}

export async function livePostPublic(): Promise<void> {
  const ref = getState().liveJob?.ref; if (!ref) return;
  const res = await api<{ ref: string }>('/jobs/v1/publish', { body: { id: ref } }).catch(() => null);
  if (res) toast(`${ref} is on Open jobs. New offers join this list, lowest first.`);
}

export async function liveKeepWait(): Promise<void> {
  const id = getState().liveJob?.id; if (!id) return;
  const res = await api<{ message: string }>(`/requests/v1/${id}/keep-waiting`, { body: {} }).catch(() => null);
  if (res) toast(`${res.message}.`);
}

/** Stops following the current request so the New request page starts empty. The request stays in Job requests. */
export function liveLeaveAsk(): void {
  setState({ liveJob: null, asked: false, askText: '', stage: 1, offerSt: '', bidsShown: 0, draft: '' });
  replace(BIDS, []); replace(ARRIVE, []);
  void refreshAll(false);
}

/** Cancels the followed request (only before anyone is hired), then starts a new one. */
export async function liveDiscardAsk(): Promise<void> {
  const job = getState().liveJob; if (!job?.id) { liveLeaveAsk(); return; }
  const res = await api<{ ref: string }>(`/requests/v1/${job.id}`, { method: 'DELETE' }).catch(() => null);
  if (!res) return;
  toast(`${res.ref} discarded. Start a new request.`);
  liveLeaveAsk();
}

export async function liveAttachRepo(): Promise<void> {
  const job = getState().liveJob; if (!job?.id) return;
  const repo = window.prompt('Repository URL (https://github.com/owner/repo)', JOB.repo.startsWith('github.com') ? `https://${JOB.repo}` : '');
  if (!repo) return;
  const base = window.prompt('Base commit (leave empty for the latest)', '') ?? '';
  const res = await api<{ ref: string }>('/requests/v1', { method: 'PATCH', body: { id: job.id, text: getState().askText || JOB.plain, repo_url: repo.trim(), ...(base.trim() ? { base_commit: base.trim() } : {}) } }).catch(() => null);
  if (res) { toast('Repository attached. The spec writer will read it.'); await refreshAll(false); }
}

export async function liveHire(key: string): Promise<boolean> {
  const bid = BIDS.find((b) => b.key === key) as OfferView | undefined;
  if (!bid) return false;
  const res = await api<{ price: number }>('/negotiations/v1/hire', { body: { bid_id: bid.bidId } }).catch(() => null);
  if (!res) return false;
  setState((s) => ({ hire: key, offerSt: 'wait', stage: Math.max(s.stage, 4), thread: 'demo', inboxF: 'buy' }));
  toast(`Hire offer sent to ${bid.name} at ${res.price.toFixed(2)} USDC. Nothing is locked until they accept.`);
  return true;
}

export async function liveRole(role: 'hire' | 'work'): Promise<void> {
  await api('/me/v1', { method: 'PATCH', body: { role } }).catch(() => null);
}

export async function livePlaceBid(): Promise<void> {
  const ref = liveOpenRef(getState().oj);
  if (!ref) { toast('Pick a job from Open jobs first.', 'hold'); return; }
  const price = Number((window.prompt(`Your price for ${ref} in USDC`, '') ?? '').replace(/[^\d.]/g, ''));
  if (!price) return;
  const days = Number((window.prompt('Delivery in how many days?', '2') ?? '').replace(/\D/g, ''));
  if (!days) return;
  const res = await api('/bids/v1', { body: { job_id: ref, price, days } }).catch(() => null);
  if (res) { toast(`Offer sent on ${ref}: ${price.toFixed(2)} USDC in ${days} day${days === 1 ? '' : 's'}.`); await refreshAll(false); }
}

export async function liveRequestService(text: string, serviceId?: string): Promise<boolean> {
  const body: Record<string, unknown> = { text };
  if (serviceId && UUID.test(serviceId)) body['service_id'] = serviceId;
  const repo = fieldValue('rq-repo');
  if (repo) body['repo_url'] = /^https:\/\//.test(repo) ? repo : `https://${repo.replace(/^http:\/\//, '')}`;
  const budget = fieldValue('rq-b');
  if (budget) body['budget_label'] = budget.slice(0, 40);
  const res = await api<{ ref: string }>('/requests/v1', { body }).catch(() => null);
  if (!res) return false;
  toast(`${res.ref} created. The spec writer is drafting the tests.`);
  await refreshAll(false);
  return true;
}

const orderOf = (id: string) => getState().orders.find((o) => o.id === id) as LiveOrder | undefined;

export async function liveOrderAccept(id: string): Promise<void> {
  const o = orderOf(id);
  if (!o?.hireOfferId) { toast('Only a hire offer can be accepted here.', 'hold'); return; }
  const res = await api<{ funded?: boolean; fundError?: string | null }>(`/negotiations/v1/${o.hireOfferId}/accept`, { body: {} }).catch(() => null);
  if (!res) return;
  if (res.funded) toast(`${id} accepted. The buyer's agent called fund_job, so the payment is being protected.`);
  else toast(`${id} accepted, but funding did not go through${res.fundError ? `: ${res.fundError}` : ''}.`, 'hold');
  await refreshAll(false);
}

export async function liveOrderDecline(id: string): Promise<void> {
  const o = orderOf(id);
  const path = o?.hireOfferId ? `/negotiations/v1/${o.hireOfferId}/decline` : `/orders/v1/${id}/decline`;
  const res = await api(path, { body: {} }).catch(() => null);
  if (res) { toast('Declined. The buyer can pick another seller.'); await refreshAll(false); }
}

export async function liveSendOffer(id: string, priceText: string, daysText: string): Promise<boolean> {
  const price = Number((priceText.match(/[\d.]+/) ?? [''])[0]);
  const days = Number((daysText.match(/\d+/) ?? ['2'])[0]);
  if (!price) { toast('Enter a price first.', 'hold'); return false; }
  const res = await api('/bids/v1', { body: { job_id: id, price, days } }).catch(() => null);
  if (!res) return false;
  toast(`Offer sent: ${price.toFixed(2)} USDC in ${days} day${days === 1 ? '' : 's'}.`);
  await refreshAll(false);
  return true;
}

export async function liveSendThread(threadId: string, text: string): Promise<void> {
  const res = await api(`/threads/v1/${threadId}/messages`, { body: { text } }).catch(() => null);
  if (res) await loadThreads();
}

export async function liveReadNotes(): Promise<void> {
  if (getState().notes.unread === 0) return;
  await api('/notifications/v1/read', { body: {} }).catch(() => null);
  await loadNotes().catch(() => undefined);
}

const fieldValue = (id: string): string | undefined => {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el ? el.value.trim() : undefined;
};
const numberOf = (text: string | undefined): number | undefined => {
  const n = Number((text ?? '').replace(/[^\d.]/g, ''));
  return n > 0 ? n : undefined;
};
const picked = (rec: Record<string, boolean>) => Object.keys(rec).filter((k) => rec[k]);
let sellSave: Promise<unknown> = Promise.resolve();

/** Fills the wizard's toggles from the saved seller profile. */
export async function liveLoadSellProfile(): Promise<void> {
  const s0 = session;
  const p = await api<SellerProfileView>('/seller-profile/v1', { quiet: true }).catch(() => null);
  if (stale(s0) || !p) return;
  /* text the user typed while this was loading wins over the saved value */
  const typed = getState().sellForm;
  const saved: SellForm = {
    name: p.name, title: p.headline, country: p.country, langs: p.langs.join(', '), agent: p.agentName, model: p.agentModel,
    yrs: '', edu: '', work: '', bio: p.about, floor: p.priceFrom !== null ? p.priceFrom.toFixed(2) : '', max: p.id ? String(p.maxJobs) : '',
    terms: p.deliveryTerms, addr: p.payoutAddress,
  };
  const sellForm = Object.fromEntries(Object.keys(saved).map((k) => {
    const key = k as keyof SellForm;
    return [key, typed[key] && typed[key] !== (key === 'name' ? ME.name : '') ? typed[key] : saved[key] || typed[key]];
  })) as unknown as SellForm;
  setState({ sellForm, sellLoaded: true });
  if (!p.id) return;
  setState((s) => ({
    sellCoder: p.coder,
    sellPay: p.payoutChain,
    skills: p.skills.length ? Object.fromEntries(p.skills.map((k) => [k, true])) : s.skills,
    cats: p.categories.length ? { ...Object.fromEntries(Object.keys(s.cats).map((k) => [k, false])), ...Object.fromEntries(p.categories.map((k) => [k, true])) } : s.cats,
  }));
}

/** Saves the wizard step being left. Reads the inputs now, before they unmount. */
/** Avatar initials for a name, as the API accepts them (1 to 3 letters A to Z); undefined to keep the saved ones. */
const initialsFor = (name: string): string | undefined => {
  const i = name.trim().split(/\s+/).map((w) => w.normalize('NFD').replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase()).filter(Boolean).slice(0, 2).join('');
  return i || undefined;
};
/** What a wizard step saves, read from the form in the store (never from inputs that may already be gone). */
function sellStepBody(step: number): Record<string, unknown> | null {
  const s = getState(), f = s.sellForm;
  const text = (v: string) => v.trim() || undefined;
  if (step === 1) return {
    display_name: text(f.name), headline: text(f.title), country: text(f.country),
    /* the avatar follows the name */
    initials: initialsFor(f.name),
    langs: f.langs.trim() ? f.langs.split(',').map((l) => l.trim()).filter(Boolean) : undefined,
    coder: s.sellCoder,
    agent_name: s.sellCoder === 'agent' ? text(f.agent.toLowerCase()) : undefined,
    agent_model: s.sellCoder === 'agent' ? text(f.model) : undefined,
  };
  if (step === 2) return { about: text(f.bio) };
  if (step === 3) {
    const max = numberOf(f.max);
    return {
      skills: picked(s.skills), categories: picked(s.cats), price_from: numberOf(f.floor),
      max_jobs: max === undefined ? undefined : Math.round(max), delivery_terms: text(f.terms),
    };
  }
  if (step === 4) return { payout_chain: s.sellPay, payout_address: s.sellPay === 'near' ? undefined : text(f.addr) };
  return null;
}
/** Saves the wizard step being left. */
export function liveSaveSellStep(step: number): void {
  const body = sellStepBody(step);
  if (!body) return;
  sellSave = sellSave.then(() => api('/seller-profile/v1', { method: 'PATCH', body: { step, ...body } }).catch(() => null));
}
/** Saves every step at once, so publishing always sends exactly what the editor shows. */
function liveSaveSellAll(): Promise<unknown> {
  const body = Object.assign({}, ...[1, 2, 3, 4].map((st) => sellStepBody(st) ?? {})) as Record<string, unknown>;
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  sellSave = sellSave.then(() => api('/seller-profile/v1', { method: 'PATCH', body: { step: 5, ...body } }).catch(() => null));
  return sellSave;
}

/** Publishes the seller profile once the last save has landed. */
/** Set right after a publish, so the seller dashboard can say the profile is now live. */
export const justPublished: { acct: string; updated: boolean; at: number } = { acct: '', updated: false, at: 0 };

/**
 * Publishes the seller profile. Resolves as soon as the API accepted it, so the caller can open the seller
 * dashboard right away; the optional starter stake and the data refresh carry on in the background.
 */
export async function livePublishSeller(): Promise<boolean> {
  await liveSaveSellAll();
  const res = await api<{ message: string; acct: string }>('/seller-profile/v1/publish', { method: 'POST' }).catch(() => null);
  if (!res) return false;
  Object.assign(justPublished, { acct: res.acct, updated: /Updated/i.test(res.message), at: Date.now() });
  setState({ seller: true, mode: 'sell' });
  toast(`${res.message}. Selling as ${res.acct}.`);
  void (async () => {
    if (getState().stake) {
      const staked = await api<{ stake: number }>('/seller-profile/v1/stake', { body: { amount: 10 } }).catch(() => null);
      if (staked) toast(`Starter stake of 10.00 USDC added. Your starter cap is now 60 USDC.`);
    }
    await Promise.allSettled([refreshAll(false), loadMarket()]);
    setState({});
  })();
  return true;
}

/** The seller profile as GET /seller-profile/v1 returns it, for the seller dashboard. */
export interface SellerProfileView {
  id: string | null; published: boolean; publishedAt: string | null; name: string; initials: string; headline: string;
  country: string; about: string; langs: string[]; githubUsername: string; skills: string[]; categories: string[];
  priceFrom: number | null; days: number | null; coder: 'me' | 'agent'; agentName: string; agentModel: string;
  maxJobs: number; deliveryTerms: string; payoutChain: string; payoutAddress: string; level: string; acct: string;
}
export async function liveSellerProfile(): Promise<SellerProfileView | null> {
  return api<SellerProfileView>('/seller-profile/v1', { quiet: true }).catch(() => null);
}

/** Hands in a commit for a funded job. The runner checks it against the locked tests. */
export async function liveDeliver(ref: string): Promise<void> {
  const commit = (window.prompt(`Commit hash to deliver for ${ref}`, '') ?? '').trim();
  if (!commit) return;
  const repo = (window.prompt('Repository URL (leave empty to use the buyer\'s repository)', '') ?? '').trim();
  const body: Record<string, unknown> = { job_id: ref, commit_sha: commit };
  if (repo) body['repo_url'] = repo;
  const res = await api<{ attempt: number; attemptsLeft: number; runner: string }>('/deliveries/v1', { body }).catch(() => null);
  if (!res) return;
  toast(res.runner === 'queued'
    ? `Delivery ${res.attempt} submitted for ${ref}. The locked tests are running. ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? '' : 's'} left.`
    : `Delivery ${res.attempt} saved for ${ref}, but the test runner is not reachable right now.`, res.runner === 'queued' ? undefined : 'hold');
  await refreshAll(false);
}

async function loadMoney(): Promise<void> {
  const [wallet, limits] = await Promise.all([
    liveApi<{ available: number; escrowed: number; usedToday: number }>('/wallet/v1', { quiet: true }).catch(() => null),
    liveApi<{ paused: boolean }>('/mandates/v1', { quiet: true }).catch(() => null),
  ]);
  if (!wallet) return;
  setState({ money: { available: wallet.available, escrowed: wallet.escrowed, usedToday: wallet.usedToday, paused: Boolean(limits?.paused) } });
}

const usdcIn = (id: string): number | undefined => {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  const n = Number((el?.value ?? '').replace(/[^\d.]/g, ''));
  return n > 0 ? n : undefined;
};

/** Saves the Limits page through set_mandate. Reads the inputs as they are on screen. */
export async function liveSaveMandate(): Promise<void> {
  const s = getState();
  const hours = usdcIn('m-win');
  const body = {
    per_job_cap: usdcIn('m-job'),
    daily_cap: usdcIn('m-day'),
    new_seller_cap: usdcIn('m-new'),
    review_window_hours: hours && [6, 12, 24].includes(hours) ? hours : undefined,
    categories: Object.keys(s.cats).filter((k) => s.cats[k]),
    strict: s.strict,
  };
  const res = await api<{ txHash: string }>('/mandates/v1', { method: 'PATCH', body }).catch(() => null);
  if (res) { toast(`Limits saved on-chain with your full-access key (tx ${shortHash(res.txHash)}).`); await refreshAll(false); }
}

export async function livePause(): Promise<void> {
  const res = await api('/mandates/v1/pause', { body: {} }).catch(() => null);
  if (res) { toast('All agents paused. Funding and release calls are stopped.', 'block'); await refreshAll(false); }
}

export async function liveUnpause(): Promise<boolean> {
  const res = await api('/mandates/v1/unpause', { body: {} }).catch(() => null);
  if (!res) return false;
  toast('Agents are active again.');
  await refreshAll(false);
  return true;
}

export async function liveWithdraw(): Promise<void> {
  const amount = Number((window.prompt('Withdraw how many USDC?', '') ?? '').replace(/[^\d.]/g, ''));
  if (!amount) return;
  const res = await api('/wallet/v1/withdraw', { body: { amount } }).catch(() => null);
  if (res) { toast(`${amount.toFixed(2)} USDC withdrawn with your full-access key.`); await refreshAll(false); }
}

/**
 * Saves the user's own NEAR wallet account on their profile. The proof is a message signed in the wallet;
 * the backend checks it on chain before it changes anything. Returns true when the account was linked.
 */
export async function liveLinkWallet(proof: { account_id: string; public_key: string; signature: string; message: string; nonce: string; callback_url: string }): Promise<boolean> {
  const res = await api<{ acct: string; agents: string }>('/wallet/v1/link', { body: proof }).catch(() => null);
  if (!res) return false;
  Object.assign(ME, { acct: res.acct, agents: res.agents });
  toast(`Wallet linked. ${res.acct} is now your AGORA account; your agents still cannot withdraw.`);
  if (getState().live) await refreshAll(false);
  return true;
}

/** Mock chain only: adds test USDC so jobs can be funded. */
export async function liveAddFunds(): Promise<void> {
  const amount = Number((window.prompt('Add how many test USDC?', '100') ?? '').replace(/[^\d.]/g, ''));
  if (!amount) return;
  const res = await api('/wallet/v1/deposit', { body: { amount } }).catch(() => null);
  if (res) { toast(`${amount.toFixed(2)} test USDC added.`); await refreshAll(false); }
}

export async function liveRate(stars: number): Promise<void> {
  const ref = getState().liveJob?.ref;
  if (!ref) { toast('Open a paid job first.', 'hold'); return; }
  const res = await api('/reputation/v1/ratings', { body: { job_id: ref, stars } }).catch(() => null);
  if (res) toast(`${stars} star${stars > 1 ? 's' : ''} saved on ${ref}.`);
}

export interface DisputeView {
  id: string | null; job: string; role: 'buyer' | 'seller'; status: string; price: number; bondNeeded: number;
  recheck: { outcome: 'release' | 'refund' | null; deadline: string | null } | null;
  escalation: { by: string | null; claim: string | null; bond: number | null } | null;
  resolution: { ruling: string; sellerAmount: number; buyerAmount: number; by: string; bondReturned: boolean | null } | null;
  canEscalate: boolean; canFinalize: boolean; finalizeAfter: string | null;
}
interface DisputeResult { resolution: DisputeView['resolution'] }

const usd2 = (n: number | null | undefined) => (n ?? 0).toFixed(2);
const resolvedText = (r: NonNullable<DisputeView['resolution']>) =>
  `${r.ruling === 'split' ? 'Split' : r.ruling === 'release' ? 'Released' : 'Refunded'}: ${usd2(r.sellerAmount)} USDC to the seller, ${usd2(r.buyerAmount)} USDC back to the buyer${r.by === 'default' ? ' (re-check result after 72 hours)' : ''}.`;

/** Opens a dispute on the followed job and starts the free re-check. */
export async function liveOpenDispute(reason: string): Promise<boolean> {
  const ref = getState().liveJob?.ref;
  if (!ref) { toast('Open a job first.', 'hold'); return false; }
  const res = await api<{ round: number | null; reviewers: number }>('/disputes/v1', { body: { job_id: ref, reason: reason.slice(0, 500) } }).catch(() => null);
  if (!res) return false;
  toast(`Payment on ${ref} frozen. The free re-check started${res.round ? ` (round ${res.round}, ${res.reviewers} of 3 reviewers notified)` : ''}.`, 'hold', 5200);
  await refreshAll(false);
  return true;
}

export async function liveLoadDispute(): Promise<DisputeView | null> {
  const ref = getState().liveJob?.ref;
  if (!ref) return null;
  return api<DisputeView>(`/disputes/v1?job=${ref}`, { quiet: true }).catch(() => null);
}

export async function liveEscalate(d: DisputeView): Promise<void> {
  if (!d.id) return;
  const claim = d.role === 'buyer' ? 'a refund' : 'the release';
  if (!window.confirm(`Ask the DAO for ${claim} on ${d.job}? This pays a ${usd2(d.bondNeeded)} USDC bond, returned if the DAO agrees or splits.`)) return;
  const res = await api<{ bond: number }>(`/disputes/v1/${d.id}/escalate`, { body: {} }).catch(() => null);
  if (res) { toast(`Sent to the DAO with a ${usd2(res.bond)} USDC bond.`, 'hold'); await refreshAll(false); }
}

/** Mock chain only: stands in for the Sputnik DAO passing its proposal. */
export async function liveRule(d: DisputeView): Promise<void> {
  if (!d.id) return;
  const answer = (window.prompt('DAO ruling: release, refund, or split with the seller percent (e.g. split 70)', 'split 70') ?? '').trim().toLowerCase();
  if (!answer) return;
  const outcome = answer.startsWith('split') ? 'split' : answer.startsWith('ref') ? 'refund' : answer.startsWith('rel') ? 'release' : '';
  if (!outcome) { toast('Type release, refund or split.', 'hold'); return; }
  const pct = Number((answer.match(/[\d.]+/) ?? ['50'])[0]);
  const body = outcome === 'split' ? { outcome, seller_share_bps: Math.round(pct * 100) } : { outcome };
  const res = await api<DisputeResult>(`/disputes/v1/${d.id}/rule`, { body }).catch(() => null);
  if (res?.resolution) { toast(`DAO decided. ${resolvedText(res.resolution)}`, 'ok', 5200); await refreshAll(false); }
}

export async function liveFinalize(d: DisputeView): Promise<void> {
  if (!d.id) return;
  const res = await api<DisputeResult>(`/disputes/v1/${d.id}/finalize`, { body: {} }).catch(() => null);
  if (res?.resolution) { toast(`Dispute closed. ${resolvedText(res.resolution)}`, 'ok', 5200); await refreshAll(false); }
}

/** Takes the followed job's dispute one step further: escalate, the mock DAO vote, or the 72-hour default. */
export async function liveDisputeNext(): Promise<void> {
  const d = await liveLoadDispute();
  if (!d) { toast('Open a job first.', 'hold'); return; }
  if (!d.id) { toast(`${d.job} has no dispute. Open one from the job page.`, 'hold'); return; }
  if (d.resolution) { toast(resolvedText(d.resolution)); return; }
  if (d.canFinalize) { await liveFinalize(d); return; }
  if (d.status === 'escalated') { await liveRule(d); return; }
  if (d.canEscalate) { await liveEscalate(d); return; }
  if (!d.recheck?.outcome) { toast('The free re-check is still running. The reviewers decide 2 of 3.', 'hold'); return; }
  const until = d.finalizeAfter ? new Date(d.finalizeAfter).toLocaleString() : 'later';
  toast(`The re-check says ${d.recheck.outcome}. It stands unless the other side asks the DAO; it can be finalized after ${until}.`, 'hold', 5200);
}

/* ---------------- Find services, the sellers directory and Saved ---------------- */

type GigView = Gig;

/** A seller's public reputation: completion records and ratings, only from settled jobs. */
export interface ReputationView {
  settled: number; volume: number; buyers: number; pass: string; rating: number | null; ratings: number;
  records: { tokenId: string | number; job: string; title: string; amount: number; at: string }[];
  recent: { stars: number; comment: string | null; job: string; title: string; at: string }[];
}
/** Public, so it works signed out too. Null when the seller has none or the API cannot be reached. */
export const fetchReputation = (acct: string) =>
  api<ReputationView>(`/reputation/v1/${encodeURIComponent(acct)}`, { quiet: true }).catch(() => null);
type SellerDirView = SellerDir & { id?: string };
interface SavedView { services: string[]; sellers: string[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Copies the services and sellers from the API into the shared lists. Both endpoints are public. */
async function loadMarket(): Promise<void> {
  const [gigs, sellers] = await Promise.all([
    api<GigView[]>('/services/v1', { quiet: true }).catch(() => null),
    api<SellerDirView[]>('/sellers/v1', { quiet: true }).catch(() => null),
  ]);
  if (gigs) replace(GIGS, gigs);
  if (sellers) replace(SELLERS_DIR, sellers);
  setState((s) => (gigBy(s.svc) ? {} : { svc: GIGS[0]?.id ?? s.svc }));
}

async function loadSaved(): Promise<void> {
  const res = await liveApi<SavedView>('/saved/v1', { quiet: true }).catch(() => null);
  if (res) setState({ liked: res.services });
}

/** Saves or removes a service. Sample ids (when the market is empty) only toggle locally. */
export async function liveLike(id: string): Promise<void> {
  const on = getState().liked.includes(id);
  setState((s) => ({ liked: on ? s.liked.filter((x) => x !== id) : [...s.liked, id] }));
  if (!UUID.test(id)) return;
  const res = on
    ? await api(`/saved/v1/${id}`, { method: 'DELETE' }).catch(() => null)
    : await api('/saved/v1', { body: { kind: 'service', target_id: id } }).catch(() => null);
  if (!res) { setState((s) => ({ liked: on ? [...s.liked, id] : s.liked.filter((x) => x !== id) })); return; }
  if (!on) toast(`Saved ${gigBy(id)?.seller ?? 'this seller'}. Your buyer agent will ask them first on matching jobs.`);
}

/** Refreshes one service from the API before its page shows. */
export async function liveOpenGig(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const gig = await api<GigView>(`/services/v1/${id}`, { quiet: true }).catch(() => null);
  if (!gig) return;
  const i = GIGS.findIndex((g) => g.id === id);
  if (i >= 0) GIGS[i] = gig; else GIGS.push(gig);
  setState({});
}

/** Refreshes one seller's directory entry before their profile shows. */
export async function liveWho(key: string): Promise<void> {
  const seller = await api<SellerDirView>(`/sellers/v1/${encodeURIComponent(key)}`, { quiet: true }).catch(() => null);
  if (!seller) return;
  const i = SELLERS_DIR.findIndex((x) => x.key === key || x.key === seller.key);
  if (i >= 0) SELLERS_DIR[i] = seller; else SELLERS_DIR.push(seller);
  setState({});
}
