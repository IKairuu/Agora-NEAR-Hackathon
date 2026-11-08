import { ARRIVE, BIDS, DONE_JOBS, HELD, JOB, ME, OTHER_JOBS, SPEC, liveOpenRef, setLiveOpenJobs, type Bid, type OpenJob, type Order, type OtherJob } from '../data/sample';
import type { ChatMsg } from '../store/store';
import { getState, setState, toast, type LiveNote } from '../store/store';
import type { Thread } from '../store/actions';
import { api, ApiError } from './api';

/*
 * Live mode: a real account is signed in and the API answers.
 * The screens read the sample objects directly, so live data is copied into those same objects
 * and restored from the snapshot below when the user signs out or starts the demo tour.
 */

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const SNAP = { ME: clone(ME), JOB: clone(JOB), SPEC: clone(SPEC), OTHER: clone(OTHER_JOBS), DONE: clone(DONE_JOBS), BIDS: clone(BIDS), HELD: clone(HELD), ARRIVE: clone(ARRIVE) };
const replace = <T,>(target: T[], items: T[]) => { target.splice(0, target.length, ...items); };

interface MeView { id: string; name: string; acct: string; agents: string; initials: string; email: string; role: 'hire' | 'work' | null; mode: 'buy' | 'sell'; seller: boolean }
interface JobView { id: string; uuid: string; title: string; repo: string; base: string; cat: string; plain: string; posted: string; specHash: string; specLocked: boolean; budget: string; stage: string; status: [string, string]; offers: number }
interface SpecView { id: string; locked: boolean; specHash: string | null; rows: [string, string, string][] }
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

/** Called after a real sign-in. Stays in demo mode if the API cannot be reached. */
export async function goLive(): Promise<void> {
  let me: MeView;
  try { me = await api<MeView>('/me/v1', { quiet: true }); } catch (e) {
    if (e instanceof ApiError && e.status !== 0) toast(e.message, 'block');
    return;
  }
  Object.assign(ME, { name: me.name, acct: me.acct, agents: me.agents, initials: me.initials, email: me.email });
  replace(OTHER_JOBS, []); replace(DONE_JOBS, []); replace(BIDS, []); replace(HELD as unknown as HeldView[], []); replace(ARRIVE, []);
  setState((s) => ({ live: true, seller: me.seller, role: s.role ?? me.role, mode: me.mode, orders: [], newJobs: [], extra: [], tLog: {}, chatLog: {} }));
  await refreshAll(true);
  if (!timer) timer = setInterval(() => { void refreshAll(false); }, 8000);
}

/** Leaves live mode and puts the sample data back. */
export function leaveLive(): void {
  if (timer) { clearInterval(timer); timer = null; }
  Object.assign(ME, SNAP.ME); Object.assign(JOB, SNAP.JOB);
  replace(SPEC, clone(SNAP.SPEC)); replace(OTHER_JOBS, clone(SNAP.OTHER)); replace(DONE_JOBS, clone(SNAP.DONE));
  replace(BIDS, clone(SNAP.BIDS)); replace(HELD as unknown as unknown[], clone(SNAP.HELD)); replace(ARRIVE, clone(SNAP.ARRIVE));
  setLiveOpenJobs(null);
  setState({ live: false, liveJob: null, liveThreads: [], notes: { unread: 0, items: [] } });
}

async function refreshAll(first: boolean): Promise<void> {
  if (!isLive()) return;
  await Promise.allSettled([loadJobs(first), loadOrders(), loadNotes(), loadOpenJobs(), loadThreads()]);
  await loadCurrentJob();
  setState({});
}

async function loadJobs(adopt: boolean): Promise<void> {
  const jobs = await api<(OtherJob & { grp: string })[]>('/jobs/v1', { quiet: true });
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
  const job = await api<JobView>(`/jobs/v1/${ref}`, { quiet: true }).catch(() => null);
  if (!job) return;
  Object.assign(JOB, { id: job.id, title: job.title, repo: job.repo || 'No repository attached yet', base: job.base || 'main', cat: job.cat, plain: job.plain, posted: job.posted, specHash: job.specHash ? shortHash(job.specHash) : '' });
  const spec = await api<SpecView>(`/specs/v1?job=${ref}`, { quiet: true }).catch(() => null);
  replace(SPEC, spec ? spec.rows : [['Tests are being written', 'The spec writer drafts failing tests from your repository', 'Pending']]);
  const stage = stageNumber(job);
  if (stage >= 2) await loadOffers(ref);
  const offer = stage >= 2 ? await api<HireOfferView>(`/negotiations/v1/offer?job=${ref}`, { quiet: true }).catch(() => null) : null;
  setState((s) => {
    const hired = offer?.bidId ? BIDS.find((b) => (b as OfferView).bidId === offer.bidId)?.key : undefined;
    return {
      liveJob: { id: job.uuid, ref: job.id },
      asked: true,
      askText: s.askText || job.plain,
      stage: Math.max(stage, offer?.offerSt === 'wait' ? 4 : stage),
      bidsShown: ARRIVE.length,
      offerSt: offer?.offerSt ?? s.offerSt,
      hire: hired ?? s.hire,
    };
  });
}

async function loadOffers(ref: string): Promise<void> {
  const res = await api<OffersView>(`/bids/v1?job=${ref}`, { quiet: true }).catch(() => null);
  if (!res) return;
  replace(BIDS, res.offers);
  replace(HELD as unknown as HeldView[], res.held);
  replace(ARRIVE, [...res.held.map((h) => h.name), ...res.offers.map((o) => o.key)]);
}

async function loadOrders(): Promise<void> {
  if (!getState().seller) return;
  const orders = await api<LiveOrder[]>('/orders/v1', { quiet: true });
  setState({ orders });
}

async function loadNotes(): Promise<void> {
  const res = await api<{ unread: number; items: LiveNote[] }>('/notifications/v1', { quiet: true });
  setState({ notes: res });
}

async function loadOpenJobs(): Promise<void> {
  const rows = await api<OpenJobView[]>('/open-jobs/v1', { quiet: true });
  const jobs = rows.map((j): OpenJob => [j.title, j.cats, j.budget, j.check, j.bids, j.buyer, true, j.blurb, j.buyerRating, j.minutesAgo]);
  setLiveOpenJobs({ jobs, refs: rows.map((j) => j.id) });
}

async function loadThreads(): Promise<void> {
  const rows = await api<ThreadView[]>('/threads/v1', { quiet: true });
  const out: Thread[] = [];
  for (const t of rows.slice(0, 20)) {
    const msgs = await api<MessageView[]>(`/threads/v1/${t.id}/messages`, { quiet: true }).catch(() => [] as MessageView[]);
    out.push({ k: t.id, mode: t.side, who: t.with, job: t.jobId ?? '', title: t.title, st: ['', t.side === 'buy' ? 'Buying' : 'Selling'], amt: '', last: t.last, time: t.time, msgs: msgs.map((m) => ({ from: m.from, text: m.text })) });
  }
  setState({ liveThreads: out });
}

/* ---------------- live versions of the actions ---------------- */

export async function liveSubmitAsk(text: string): Promise<boolean> {
  const first = !getState().asked && getState().stage < 2;
  const res = await api<{ id: string; ref: string }>('/requests/v1', { body: { text } }).catch(() => null);
  if (!res) return false;
  if (first) {
    setState({ liveJob: { id: res.id, ref: res.ref }, asked: true, askText: text });
    toast(`${res.ref} created. The spec writer is turning it into tests.`);
  } else {
    toast(`${res.ref} created as a separate request. It is in Job requests.`);
  }
  await refreshAll(false);
  return true;
}

export async function liveLockSpec(): Promise<void> {
  const ref = getState().liveJob?.ref; if (!ref) return;
  const spec = await api<SpecView>(`/specs/v1?job=${ref}`, { quiet: true }).catch(() => null);
  if (!spec) { toast('The spec writer has not drafted tests for this job yet. Try again in a minute.', 'hold'); return; }
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

export async function liveRequestService(text: string): Promise<boolean> {
  const res = await api<{ ref: string }>('/requests/v1', { body: { text } }).catch(() => null);
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

interface SellProfileView {
  id: string | null; step: number; published: boolean; skills: string[]; categories: string[];
  coder: 'me' | 'agent'; payoutChain: string;
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
  const p = await api<SellProfileView>('/seller-profile/v1', { quiet: true }).catch(() => null);
  if (!p?.id) return;
  setState((s) => ({
    sellCoder: p.coder,
    sellPay: p.payoutChain,
    skills: p.skills.length ? Object.fromEntries(p.skills.map((k) => [k, true])) : s.skills,
    cats: p.categories.length ? { ...Object.fromEntries(Object.keys(s.cats).map((k) => [k, false])), ...Object.fromEntries(p.categories.map((k) => [k, true])) } : s.cats,
  }));
}

/** Saves the wizard step being left. Reads the inputs now, before they unmount. */
export function liveSaveSellStep(step: number): void {
  const s = getState();
  let body: Record<string, unknown> | null = null;
  if (step === 1) {
    const langs = fieldValue('sl-lang');
    body = {
      display_name: fieldValue('sl-name') || undefined,
      headline: fieldValue('sl-title') || undefined,
      country: fieldValue('sl-country') || undefined,
      langs: langs === undefined ? undefined : langs.split(',').map((l) => l.trim()).filter(Boolean),
      coder: s.sellCoder,
      agent_name: s.sellCoder === 'agent' ? fieldValue('sl-ag')?.toLowerCase() || undefined : undefined,
      agent_model: s.sellCoder === 'agent' ? fieldValue('sl-model') || undefined : undefined,
    };
  } else if (step === 2) {
    body = { about: fieldValue('sl-bio') || undefined };
  } else if (step === 3) {
    const max = numberOf(fieldValue('sl-max'));
    body = {
      skills: picked(s.skills),
      categories: picked(s.cats),
      price_from: numberOf(fieldValue('sl-floor')),
      max_jobs: max === undefined ? undefined : Math.round(max),
      delivery_terms: fieldValue('sl-terms') || undefined,
    };
  } else if (step === 4) {
    body = { payout_chain: s.sellPay, payout_address: s.sellPay === 'near' ? undefined : fieldValue('sl-addr') || undefined };
  }
  if (!body) return;
  sellSave = api('/seller-profile/v1', { method: 'PATCH', body: { step, ...body } }).catch(() => null);
}

/** Publishes the seller profile once the last save has landed. */
export async function livePublishSeller(): Promise<boolean> {
  await sellSave;
  const res = await api<{ message: string; acct: string }>('/seller-profile/v1/publish', { method: 'POST' }).catch(() => null);
  if (!res) return false;
  setState({ seller: true });
  toast(`${res.message}. Selling as ${res.acct}.`);
  await refreshAll(false);
  return true;
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
