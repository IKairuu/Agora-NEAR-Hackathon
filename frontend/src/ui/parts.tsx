import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router';
import { agentPick, dirKey, GIGS, LIFE, ME, OTHER_JOBS, sellerBy, usd, type Gig, type OtherJob } from '../data/data';
import { act, pathOf } from '../store/actions';
import { fetchReputation, type ReputationView } from '../lib/live';
import { getState, hb, hPrice, openModal, useApp, type State } from '../store/store';
import { Icon, type IconName } from './icons';

/** In-app link by prototype route name ('ask', 'jobs', ...). */
export function RLink({ r, children, ...rest }: { r: string; children: ReactNode } & Omit<LinkProps, 'to'>) {
  return <Link to={pathOf(r)} {...rest}>{children}</Link>;
}

/** An avatar circle: the photo when there is one, the initials otherwise. */
export function Face({ photo, initials, className = '' }: { photo?: string; initials: ReactNode; className?: string }) {
  return <span className={`avatar ${photo ? 'has-photo' : ''} ${className}`.trim()}>{photo ? <img src={photo} alt="" /> : initials}</span>;
}

export function Head({ crumbs, title, sub, actions }: { crumbs?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/** Shown in place of a page that needs a later demo stage. */
export function Gate({ msg, children }: { msg: string; children?: ReactNode }) {
  return <div className="empty"><Icon name="lock" /><b>{msg}</b>{children}</div>;
}
export const SignInButton = ({ label = 'Sign in' }: { label?: string }) => <button className="btn primary" onClick={act.signin}>{label}</button>;

/** The eight lifecycle nodes; `at` is the current one. */
export function Nodes({ at, blocked }: { at: number; blocked?: boolean }) {
  return (
    <ol className="nodes" aria-label={`Stage ${Math.min(at + 1, 8)} of 8`}>
      {LIFE.map((x, i) => <li key={x} className={i < at ? 'done' : i === at ? (blocked ? 'stop' : 'now') : ''}><i aria-hidden="true">{i < at && <Icon name="check" />}</i><span>{x}</span></li>)}
    </ol>
  );
}
export function Lifecycle() {
  const { stage } = useApp();
  const at = stage >= 7 ? 8 : stage >= 6 ? 4 : stage >= 5 ? 3 : stage >= 4 ? 3 : stage >= 3 ? 1 : stage >= 2 ? 1 : 0;
  return <div className="life-n"><Nodes at={at} blocked={stage >= 8} /></div>;
}

/** A seller's name: a link to their profile when they are in the directory. */
export function SName({ name, cls = '' }: { name: string; cls?: string }) {
  const k = dirKey(name);
  return k ? <button className={`as-link sname ${cls}`.trim()} onClick={() => act.who(k)}>{name}</button> : <b>{name}</b>;
}

export function Mk({ k }: { k: 'ok' | 'hold' | 'block' }) {
  return <span className={`m ${k}`}><Icon name={k === 'block' ? 'x' : k === 'hold' ? 'warn' : 'check'} /></span>;
}
export const Check = ({ k = 'ok', children }: { k?: 'ok' | 'hold' | 'block'; children: ReactNode }) => <div className="check"><Mk k={k} />{children}</div>;

export const T = ({ name, tip }: { name: string; tip: string }) => <span className="tool" title={tip}>{name}</span>;

export function Tl({ k, h, p, n = '' }: { k: '' | 'ok' | 'block' | 'now' | 'hold'; h: string; p: string; n?: string }) {
  return (
    <div className="tl-i">
      <span className={`tl-dot ${k}`}>{k === 'ok' ? <Icon name="check" /> : k === 'block' ? <Icon name="x" /> : n}</span>
      <div><h4>{h}</h4><p>{p}</p></div>
    </div>
  );
}

export function Review({ who, txt, when, stars = 5 }: { who: string; txt: string; when: string; stars?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid var(--color-rule)', paddingBottom: 12 }}>
      <div className="row"><b style={{ fontWeight: 500 }} className="small">{who}</b><span className="muted xsmall">{stars} of 5</span><span className="muted xsmall" style={{ marginLeft: 'auto' }}>{when}</span></div>
      <span className="muted small">{txt}</span>
      <span className="status ok"><Icon name="check" />Settled job</span>
    </div>
  );
}

interface FeedItem { t: string; who: string; txt: string; k: string }
/** Agent activity, newest first. Also feeds the demo job's activity log. */
const NOTE_WHO: Record<string, string> = { held: 'Fraud and lure agent', message: 'Messages', offer: 'Buyer agent', payment: 'Transaction agent', review: 'Reviewers', job: 'Spec writer' };
export function feedItems(s: State): FeedItem[] {
  /* live: the account's own events, never the demo story */
  if (s.live) return s.notes.items.map((n) => ({ t: n.time, who: NOTE_WHO[n.kind] ?? 'AGORA', txt: n.text, k: n.kind === 'held' ? 'hold' : '' }));
  const { stage } = s;
  const items: FeedItem[] = [];
  const add = (t: string, who: string, txt: string, k = '') => items.push({ t, who, txt, k });
  const H = hb(s), A = usd(hPrice(s));
  if (stage >= 8) add('16:42:19', 'Guardian', 'Paused all agents after 6 rejected calls in 40 seconds from the transaction key.', 'block');
  if (stage >= 7) { add('16:31:05', 'Contract', `Released ${A} USDC to ${H.acct}. Completion record #412 minted.`, 'ok'); add('16:31:04', 'Reviewer B', 'Approved commit e5f1d07 (2 of 3). Attestation recorded.', 'ok'); }
  if (stage >= 6) add('16:24:40', 'Reviewers', 'Rejected commit 3b9c2aa: it edited the locked test. 0 of 3 approved.', 'block');
  if (stage >= 5) { add('16:12:02', 'Transaction agent', `Moved ${A} USDC into Protected payment for J-1042. 9 limit checks passed.`, 'ok'); add('16:12:01', H.name, 'Accepted the hire offer.', 'ok'); }
  if (stage >= 4 && (s.offerSt || stage >= 5)) add('16:11:52', 'Buyer agent', `Sent the hire offer to ${H.name}: ${A} USDC, tests locked. Waiting for an answer.`);
  s.declined.filter((k) => k !== s.hire).slice().reverse().forEach((k) => { const x = sellerBy(k); if (!x) return; add('16:11:50', x.name, 'Declined the hire offer. Nothing was locked.', 'block'); add('16:11:45', 'Buyer agent', `Sent the hire offer to ${x.name}.`); });
  const pick = agentPick();
  if (stage >= 4 && !s.preNeg && pick) add('16:11:40', 'Buyer agent', `Negotiated ${pick.name} from ${usd(pick.price)} to ${usd(pick.final)} USDC, under the 35.50 median.`);
  if (stage >= 3) { add('16:08:13', 'Fraud and lure agent', 'Held 2 offers: one asked for off-platform payment, one priced 94% below the usual price.', 'hold'); add('16:07:55', 'Buyer agent', '3 valid offers in. You can choose now.'); }
  if (stage >= 2) add('16:03:20', 'Spec writer', 'You locked 2 failing tests and 6 checks for J-1042. Sent privately to 9 matching sellers.');
  if (stage >= 1) add('16:01:02', 'Account', `Created ${ME.acct} and ${ME.agents}. Gas paid by relayer.`);
  return items;
}
export function Feed({ short }: { short?: boolean }) {
  const s = useApp();
  const items = feedItems(s);
  const list = short ? items.slice(0, 5) : items;
  if (!list.length) return <p className="muted" style={{ padding: '12px 0' }}>Nothing yet.</p>;
  const icon = (k: string): IconName => (k === 'block' ? 'x' : k === 'hold' ? 'warn' : k === 'ok' ? 'check' : 'bolt');
  return (
    <div className="feed">
      {list.map((i) => (
        <div className="feed-i" key={i.t + i.who + i.txt}>
          <Icon name={icon(i.k)} className={i.k} />
          <div><b style={{ fontWeight: 500 }}>{i.who}</b> <span className="muted">{i.txt}</span></div>
          <time>{i.t}</time>
        </div>
      ))}
    </div>
  );
}

export function PastJob({ id, t, who, amt }: { id: string; t: string; who: string; amt: string }) {
  return (
    <div className="job-card">
      <div className="row"><span className="pill ok">Settled</span><span className="mono muted xsmall">{id}</span><span className="num" style={{ marginLeft: 'auto', fontWeight: 500 }}>{amt} USDC</span></div>
      <h3>{t}</h3>
      <div className="meta"><span>Paid to <span className="mono">{who}</span></span><span>Released by 2 of 3 reviewers</span></div>
    </div>
  );
}

export function OtherJobCard({ j }: { j: OtherJob }) {
  return (
    <button className="job-card as-btn" onClick={() => openModal('ojob', { id: j.id })}>
      <div className="row"><span className={`pill ${j.status[0]}`}>{j.status[1]}</span><span className="mono muted xsmall">{j.id}</span>{j.who && <span className="muted xsmall">{j.who}</span>}</div>
      <h3>{j.title}</h3>
      <div className="meta"><span>{j.cat}</span><span>Budget {j.budget} USDC</span><span>{j.note}</span></div>
    </button>
  );
}
/** Delete (a draft) or Cancel (an open job), with a confirm dialog. Renders nothing for jobs that allow neither. */
export function RemoveJobButton({ id, title, kind, sm = true }: { id: string; title: string; kind: 'delete' | 'cancel' | null | undefined; sm?: boolean }) {
  if (!kind) return null;
  return (
    <button className={`btn danger ${sm ? 'sm' : ''}`} onClick={(e) => { e.stopPropagation(); openModal('removejob', { id, kind, title }); }}>
      <Icon name="x" />{kind === 'delete' ? 'Delete draft' : 'Cancel job'}
    </button>
  );
}
export const allOtherJobs = () => [...getState().newJobs, ...OTHER_JOBS];

/* ---------------- services: thumbnails and cards ---------------- */
export function Thumb({ g }: { g: Gig }) {
  let art: ReactNode = null;
  switch (g.thumb) {
    case 'test': art = <div className="t-term"><span className="d">$ cargo test</span><span>test_split_rounding <em>ok</em></span><span>test_split_dust <em>ok</em></span><span>test_refund <em>ok</em></span><span className="sum">31 passed, 0 failed</span></div>; break;
    case 'contract': art = <div className="t-sig"><span className="d">#[near]</span><span>pub fn <b>get_jobs</b>(</span><span>{'  '}&amp;self, from: u64,</span><span>{'  '}limit: u64</span><span>{') -> Vec<Job>'}</span></div>; break;
    case 'coverage': art = <div className="t-cov"><div className="ring" style={{ ['--p' as string]: 90 }}><b>90%</b></div><div className="bars"><i style={{ ['--w' as string]: '62%' }} /><i style={{ ['--w' as string]: '90%' }} /><span className="d">62% before, 90% after</span></div></div>; break;
    case 'browser': art = <div className="t-vp"><div className="win"><i /><i /><i /></div><div className="vps">{[['22%', '390'], ['40%', '768'], ['64%', '1280']].map(([w, t]) => <span key={t} style={{ ['--w' as string]: w }}>{t}</span>)}</div></div>; break;
    case 'csv': art = <div className="t-csv">{[['account', 'balance'], ['ana.near', '1,204.50'], ['kenji.near', '880.00'], ['li.near', '312.25']].map((r, i) => <span key={r[0]} className={i ? '' : 'h'}><i>{r[0]}</i><i>{r[1]}</i></span>)}</div>; break;
    case 'upgrade': art = <div className="t-up"><span className="v">v4</span><span className="arr">→</span><span className="v hi">v5</span><span className="d">12 tests pass</span></div>; break;
    case 'diff': art = <div className="t-diff"><span className="del">- let share = total / n;</span><span className="add">+ let share = total / n;</span><span className="add">+ let dust = total % n;</span><span className="add">+ last += dust;</span></div>; break;
    case 'audit': art = <div className="t-aud"><span><Icon name="check" />Full-access key on owner only</span><span><Icon name="check" />Agent key: 6 methods</span><span><Icon name="check" />Per-job cap 50 USDC</span></div>; break;
  }
  return <div className={`thumb ${g.tone}`} aria-hidden="true">{art}</div>;
}

export const levelClass = (lvl: string) => (lvl === 'Top rated' ? 'top' : lvl === 'New seller' ? 'new' : '');

export function GigCard({ g }: { g: Gig }) {
  const { liked } = useApp();
  const on = liked.includes(g.id);
  return (
    <article className="gig">
      <button className="gig-pic" onClick={() => act.openGig(g.id)} aria-label={`Request: ${g.title}`}><Thumb g={g} /></button>
      <button className={`heart ${on ? 'on' : ''}`} onClick={() => act.like(g.id)} aria-pressed={on} aria-label={on ? 'Remove from saved' : 'Save'}><Icon name="heart" /></button>
      <div className="gig-by">
        <span className={`avatar xs ${g.kind === 'agent' ? 'ag' : ''}`}>{g.initials}</span><SName name={g.seller} />
        {g.kind === 'agent' && <span className="lvl">Agent</span>}
        <span className={`lvl ${levelClass(g.level)}`}>{g.level}</span>
      </div>
      <button className="gig-t" onClick={() => act.openGig(g.id)}>{g.title}</button>
      <div className="rate"><Icon name="star" /><b>{g.rating.toFixed(1)}</b><span className="muted">({g.count})</span></div>
      <div className="from">From <b className="num">{g.from} USDC</b><span className="muted">, {g.days === 1 ? '1 day' : g.days + ' days'}</span></div>
    </article>
  );
}
export const POPULAR = GIGS.slice(0, 8);

/* ---------------- popover, liquid glass, anchored under its button ---------------- */
export function usePop(): [boolean, RefObject<HTMLButtonElement | null>, () => void, () => void] {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return [open, ref, toggle, close];
}
export function Pop({ anchor, onClose, wide, children }: { anchor: RefObject<HTMLElement | null>; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const r = anchor.current?.getBoundingClientRect();
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.mi')?.focus();
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); anchor.current?.focus(); } };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key); addEventListener('resize', onClose);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); removeEventListener('resize', onClose); };
  }, [anchor, onClose]);
  if (!r) return null;
  /* line the popover's right edge up with the button, but never let it run off the left of a narrow screen */
  const width = wide ? Math.min(380, innerWidth - 24) : 280;
  const right = Math.max(12, Math.min(innerWidth - r.right, innerWidth - 12 - width));
  return createPortal(
    <div ref={box} className={`pop ${wide ? 'wide' : ''}`} role="menu" style={{ top: r.bottom + 10, right }}>{children}</div>,
    document.body,
  );
}

/** A seller's reputation from the backend. `undefined` while loading, `null` when there is none. */
export function useReputation(acct: string | undefined): ReputationView | null | undefined {
  const [rep, setRep] = useState<ReputationView | null | undefined>(undefined);
  useEffect(() => {
    let on = true; setRep(undefined);
    if (!acct) { setRep(null); return; }
    void fetchReputation(acct).then((r) => { if (on) setRep(r); });
    return () => { on = false; };
  }, [acct]);
  return rep;
}
export const dateOf = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); };
/** Reviews from settled jobs, with an empty state. `lead` is a review to show first (the demo's settled job). */
export function SellerReviews({ rep, lead }: { rep: ReputationView | null | undefined; lead?: ReactNode }) {
  const items = rep?.recent ?? [];
  return (
    <>
      {lead}
      {items.map((r) => <Review key={r.job + r.at} who={r.title} txt={r.comment || 'No comment left.'} when={dateOf(r.at)} stars={r.stars} />)}
      {rep === undefined && !lead && <p className="muted small">Loading reviews…</p>}
      {rep !== undefined && !items.length && !lead && <div className="empty"><Icon name="star" /><b>No reviews yet</b><span>Reviews appear here once a job with this seller is paid.</span></div>}
    </>
  );
}
