import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ARRIVE, BIDS, DONE_JOBS, FILTERS, GIGS, gigBy, HELD, JF, JOB, ME, openJobs, OTHER_JOBS, SELLERS_DIR, usd, type FilterKey, type Gig, type OpenJob, type OtherJob } from '../data/sample';
import { act, acScroll, hire } from '../store/actions';
import { escrow, free, getState, hb, hPrice, paused, priceOf, setState, toast, useApp, type State } from '../store/store';
import { Icon } from '../ui/icons';
import { Feed, feedItems, Gate, GigCard, Head, levelClass, Lifecycle, Mk, Nodes, OtherJobCard, PastJob, Review, RLink, SignInButton, SName, Thumb } from '../ui/parts';
import { Shell } from '../ui/Shell';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const SUGG = ['Fix the failing test in payroll-vault', 'Add pagination to get_jobs', 'Write tests for the refund callback', 'Fix the Safari wallet modal'];

/* ---------------- New request: a chat with your agent team ---------------- */
interface OfferRow { key: string; name: string; kind: 'agent' | 'human'; held: boolean; price: number; fraud: number; why?: string; settled?: number; pass?: string; days?: string; newSeller?: boolean }
/** Offers that have arrived so far, lowest price first. */
function offerPool(s: State): OfferRow[] {
  const n = s.stage >= 3 ? ARRIVE.length : Math.min(s.bidsShown, ARRIVE.length);
  return ARRIVE.slice(0, n).map((k): OfferRow => {
    const b = BIDS.find((x) => x.key === k);
    if (b) return { key: b.key, name: b.name, kind: b.kind, held: false, price: priceOf(s, b), fraud: b.fraud, settled: b.settled, pass: b.pass, days: b.days, newSeller: b.newSeller };
    const h = HELD.find((x) => x.name === k)!;
    return { key: h.name, name: h.name, kind: h.kind, held: true, price: h.price, fraud: h.fraud, why: h.why };
  }).sort((a, b) => a.price - b.price);
}

function AgentMsg({ who, t, children }: { who: string; t?: string; children: ReactNode }) {
  return <div className="am"><span className="avatar ag"><Icon name="bot" /></span><div className="am-b"><div className="am-who"><b>{who}</b>{t && <time>{t}</time>}</div>{children}</div></div>;
}
const MeMsg = ({ text }: { text: string }) => <div className="um"><div className="bub">{text}</div></div>;

function SpecCard({ locked }: { locked: boolean }) {
  return (
    <div className="ccard">
      <div className="cc-h"><Icon name="flask" /><b>Tests that decide when it's done</b>{locked ? <span className="pill acc"><Icon name="lock" />Locked</span> : <span className="pill">Draft</span>}</div>
      <div className="code">
        <span className="cm">// tests/split.rs, written by the spec writer, fails on {JOB.base} today</span>
        {'\n#[test]\nfn test_split_rounding() {\n    let paid = split_payment('}<span className="add">1_000_000</span>{', &[w1, w2, w3]);\n    assert_eq!(paid.iter().sum::<u128>(), '}<span className="add">1_000_000</span>{'); '}<span className="cm">// today: 999_999</span>{'\n}'}
      </div>
      <dl className="kv"><dt>Repository</dt><dd className="mono">{JOB.repo}</dd><dt>Checks</dt><dd>2 failing tests, full suite of 31, only src/split.rs, builds, no planted text</dd><dt>Deliver within</dt><dd>2 days</dd><dt>Your private limit</dt><dd className="num">38.00 USDC, sellers see "under 40"</dd></dl>
      {locked
        ? <span className="muted xsmall">Spec hash <span className="mono">{JOB.specHash}</span> stored with the job. Nobody can change these tests now.</span>
        : <div className="cc-acts"><button className="btn primary" onClick={act.lockspec}><Icon name="lock" />Approve and lock the tests</button><button className="btn ghost" onClick={act.editspec}>Change something</button></div>}
    </div>
  );
}

function OffersCard() {
  const s = useApp();
  const rows = offerPool(s), valid = rows.filter((r) => !r.held), held = rows.filter((r) => r.held);
  const ready = valid.length >= 3, live = s.stage < 3;
  const best = s.stage >= 3 ? 'patchsmith' : '';
  const row = (r: OfferRow) => {
    if (r.held) return (
      <li key={r.key} className="orow2 held">
        <span className="avatar held">{r.name.slice(0, 2).toUpperCase()}</span>
        <div className="or-m">
          <div className="or-t"><b>{r.name}</b><span className="pill hold"><Icon name="warn" />Held: {r.why === 'Off-platform request' ? 'asked to be paid off-platform' : 'far below the usual price'}</span></div>
          <span className="muted xsmall">Fraud and lure agent, risk {r.fraud} of 100. {r.why === 'Off-platform request' ? 'Escrow only pays the hired seller, so this text cannot move money.' : 'The seller can explain within 24 hours.'}</span>
        </div>
        <div className="or-p"><b className="num">{usd(r.price)}</b><span className="muted xsmall">USDC</span><button className="btn sm" disabled aria-label={`${r.name} is held and cannot be chosen`}>Held</button></div>
      </li>
    );
    const isBest = r.key === best, dec = s.declined.includes(r.key), neg = r.key === 'patchsmith' && s.stage >= 4 && !s.preNeg;
    return (
      <li key={r.key} className={`orow2 ${isBest ? 'best' : ''}`}>
        <span className={`avatar ${r.kind === 'agent' ? 'ag' : ''}`}>{r.name.slice(0, 2).toUpperCase()}</span>
        <div className="or-m">
          <div className="or-t">
            <b>{r.name}</b><span className="lvl">{r.kind === 'agent' ? 'AI agent' : 'Developer'}</span>
            {isBest && <span className="pill ok"><Icon name="star" />Best pick</span>}
            {neg && <span className="pill acc">Negotiated</span>}
            {r.newSeller && <span className="pill info">New seller</span>}
            {dec && <span className="pill">Declined</span>}
            {s.stage >= 5 && r.key === s.hire && <span className="pill ok"><Icon name="check" />Hired</span>}
          </div>
          <span className="muted xsmall">{r.settled} settled jobs · {r.pass} pass first try · risk {r.fraud} of 100 · {r.days} · {r.key === 'rustwright' ? 2 : 3} attempts</span>
        </div>
        <div className="or-p">
          {neg && <s className="muted num">{usd(36)}</s>}
          <b className="num">{usd(r.price)}</b><span className="muted xsmall">USDC</span>
          <button className={`btn sm ${isBest ? 'primary' : ''}`} onClick={() => hire(r.key)} disabled={!ready || dec || s.stage >= 5}>Choose</button>
        </div>
      </li>
    );
  };
  return (
    <div className="ccard offers">
      <div className="cc-h"><Icon name="trend" /><b>Offers, lowest price first</b><span className="muted xsmall">{valid.length} valid{held.length ? `, ${held.length} held` : ''}</span>{live && <span className="pill info"><span className="spin" />Arriving</span>}</div>
      {rows.length ? <ol className="olist2">{rows.map(row)}</ol> : <p className="muted small">No offers yet. Matching sellers usually answer within a few minutes.</p>}
      {!ready && rows.length > 0 && <p className="muted xsmall">Your agent waits for 3 valid offers before you can choose, so the first fast offer doesn't win by default.</p>}
      <div className="cc-f">
        <span className="muted xsmall">Price check by the fraud and lure agent: usual price 28 to 45 USDC{valid.length >= 3 ? ', median valid offer 35.50' : ''}.</span>
        {s.stage < 5 && <button className="lk" onClick={act.postpublic}>None fit? Post it publicly</button>}
      </div>
    </div>
  );
}

function Composer({ big }: { big: boolean }) {
  const s = useApp();
  const input = useRef<HTMLTextAreaElement>(null);
  const submit = () => act.submitAsk(getState().draft.trim());
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
  return (
    <form className={`composer ${big ? '' : 'docked'}`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="visually-hidden" htmlFor="ask-in">Describe the job</label>
      <textarea id="ask-in" ref={input} rows={big ? 3 : 1} value={s.draft} onChange={(e) => setState({ draft: e.target.value })} onKeyDown={onKey}
        placeholder={big ? 'Describe a bug, a test or a small feature. Paste a repo link if you have one.' : 'Reply to your agent'} />
      <div className="bar2">
        {big && <><button type="button" className="btn sm" onClick={act.attachrepo}><Icon name="repo" />Add repository</button><span className="muted xsmall">Your budget limit stays private to your agent</span></>}
        <button type="submit" className="btn primary send" aria-label="Send to your agent"><Icon name="up" /></button>
      </div>
    </form>
  );
}

export function Ask() {
  const s = useApp();
  const started = s.asked || s.stage >= 2;
  useEffect(() => { if (started) acScroll(); }, [started]);
  if (!started) {
    const pick = (t: string) => { setState({ draft: t }); requestAnimationFrame(() => document.getElementById('ask-in')?.focus()); };
    return (
      <Shell cur="ask">
        <div className="ask">
          <div className="ask-head"><span className="muted">{s.stage >= 1 ? `${greeting()}, ${ME.name}` : 'No account needed to look around'}</span><h1>What should we get built?</h1><p className="muted">Tell your agent in plain words. It writes the tests, collects offers and shows you the lowest first.</p></div>
          <Composer big />
          <div className="sugg">{SUGG.map((t) => <button key={t} className="chip" onClick={() => pick(t)}>{t}</button>)}</div>
          <div className="services">
            <div className="services-h">
              <h2>Popular services</h2><span className="muted small">Each one ends with a test the reviewers can run</span>
              <RLink r="explore" className="see-all" onClick={() => setState({ exTab: 'services' })}>See all <Icon name="ext" /></RLink>
            </div>
            <div className="gig-grid">{GIGS.slice(0, 8).map((g) => <GigCard key={g.id} g={g} />)}</div>
            <p className="muted xsmall">Sellers, prices and ratings are sample data for this prototype.</p>
          </div>
        </div>
      </Shell>
    );
  }
  const H = hb(s);
  return (
    <Shell cur="ask">
      <div className="achat">
        <div className="ac-head"><div><h1>New request</h1><p className="muted small">Spec writer, buyer agent and fraud and lure agent are working on this job.</p></div><div className="ac-acts">{s.stage < 4 && (s.live ? !!s.liveJob : s.stage < 2) && <button className="btn sm ghost" onClick={act.discardask}><Icon name="x" />Discard</button>}<button className="btn sm ghost" onClick={act.newask}><Icon name="spark" />New request</button><RLink r="jobs" className="btn sm ghost"><Icon name="job" />Job requests</RLink></div></div>
        <div className="ac-log" id="aclog" aria-live="polite">
          <MeMsg text={s.askText || JOB.plain} />
          <AgentMsg who="Spec writer" t="16:02"><p>I read <span className="mono">payroll-vault</span> at <span className="mono">{JOB.base}</span>. Here are the tests a seller must make pass. Nothing is sent to anyone until you lock them.</p><SpecCard locked={s.stage >= 2} /></AgentMsg>
          {s.stage >= 2 && <AgentMsg who="Buyer agent" t="16:03"><p>Tests locked. I sent the job privately to 9 sellers and bidding agents whose skills match. Their offers appear below as they arrive, lowest price first.</p><OffersCard /></AgentMsg>}
          {s.stage >= 4 && <AgentMsg who="Buyer agent" t="16:11"><p>{s.preNeg ? 'You chose before I negotiated, so the listed price stands.' : <>Three valid offers were in, so I negotiated within your private limit. patchsmith came down from 36.00 to <b>32.00 USDC</b>, under the 35.50 median, and has the best track record.</>} Choose any offer above. I'll send the hire offer in your chat room and wait for the seller to accept.</p></AgentMsg>}
          {s.stage >= 5 && <AgentMsg who="Transaction agent" t="16:12"><p>{H.name} accepted. {usd(hPrice(s))} USDC is in <b>Protected payment</b>, held by the contract until 2 of 3 reviewers pass the tests.</p><div className="cc-acts"><RLink r="chat" className="btn"><Icon name="chat" />Open chat room</RLink><RLink r="room" className="btn"><Icon name="lock" />Protected payment</RLink></div></AgentMsg>}
          {s.extra.map((x) => (
            <Fragment key={x.id}>
              <MeMsg text={x.text} />
              <AgentMsg who="Buyer agent" t={x.t}>
                {x.posted
                  ? <p>Posted publicly as <b>{x.id}</b> on Open jobs. Any seller can now offer, and the same checks apply. Track it in <RLink r="jobs">Job requests</RLink>.</p>
                  : <>
                    <p>I sent "{x.text.length > 60 ? x.text.slice(0, 58) + '…' : x.text}" privately to matching sellers. <b>No offers came back</b> within 30 minutes.</p>
                    <div className="ccard"><div className="cc-h"><Icon name="globe" /><b>Last option: post it publicly</b></div><p className="muted small">Your job goes on Open jobs, where every seller and bidding agent can offer. The tests are locked first, as always.</p><div className="cc-acts"><button className="btn primary" onClick={() => act.postpublic2(x.id)}>Post publicly</button><button className="btn ghost" onClick={act.keepwait}>Keep waiting</button></div></div>
                  </>}
              </AgentMsg>
            </Fragment>
          ))}
        </div>
        <Composer big={false} />
      </div>
    </Shell>
  );
}
/** Post a job is the same chat as New request: one way in. */
export const Post = Ask;

/* ---------------- job requests ---------------- */
interface JobView extends OtherJob { demo?: boolean }
/** The demo job as a job request card, or null before it is requested. */
function demoJob(s: State): JobView | null {
  if (s.stage < 2) return null;
  const at = s.stage >= 7 ? 8 : s.stage >= 5 ? 4 : s.stage >= 4 ? 2 : 1;
  const waiting = s.stage === 4 && s.offerSt === 'wait';
  const st: [string, string] = s.stage >= 8 ? ['block', 'Agents paused'] : s.stage >= 7 ? ['ok', 'Paid'] : s.stage >= 6 ? ['hold', 'Revision requested'] : s.stage >= 5 ? ['acc', 'Payment protected'] : waiting ? ['hold', 'Waiting on seller'] : s.stage >= 4 ? ['info', 'Offer agreed'] : ['info', 'Getting offers'];
  const grp = s.stage >= 7 ? 'done' : s.stage >= 5 ? 'working' : waiting ? 'waiting' : 'offers';
  const ev = feedItems(s).filter((i) => i.who !== 'Account').map((i): [string, string, string] => [i.t.slice(0, 5), i.who, i.txt]);
  return { id: JOB.id, title: JOB.title, cat: JOB.cat, budget: s.stage >= 5 ? usd(hPrice(s)) : 'under 40', status: st, who: s.stage >= 4 ? hb(s).name : '', due: s.stage >= 7 ? 'Ended today' : 'Due in 2 days', at, grp, ev, href: s.stage >= 5 ? 'room' : s.stage >= 4 ? 'chat' : 'ask', demo: true };
}
function allJobs(s: State) {
  const d = demoJob(s);
  const nj = s.newJobs.map((j): JobView => ({ at: j.posted ? 1 : 0, grp: j.posted ? 'offers' : 'waiting', due: 'Due in 3 days', ev: [['Now', 'Buyer agent', j.note || '']], ...j }));
  const on = [...(d && d.grp !== 'done' ? [d] : []), ...nj, ...(s.stage >= 1 ? OTHER_JOBS : [])];
  const done = [...(d && d.grp === 'done' ? [d] : []), ...DONE_JOBS];
  return { on, done };
}

function JobBig({ j }: { j: JobView }) {
  return (
    <article className="jbig">
      <div className="jb-l">
        <div className="jb-top">
          <h3>{j.href ? <RLink r={j.href}>{j.title}</RLink> : <button className="as-link" onClick={() => setState({ modal: { kind: 'ojob', props: { id: j.id } } })}>{j.title}</button>}</h3>
          <span className={`pill ${j.status[0]}`}>{j.status[1]}</span>
        </div>
        <div className="jb-meta"><span>{j.cat}</span><span className="num">Budget {j.budget} USDC</span><span>{j.due}</span>{j.who && <span>Seller: {j.who}</span>}<span className="mono">{j.id}</span></div>
        {j.ev && j.ev.length > 0 && (
          <details className="jb-log"><summary>Activity <span className="tcount">{j.ev.length}</span></summary>
            <ol>{j.ev.map((e, i) => <li key={i}><time>{e[0]}</time><b>{e[1]}</b><span>{e[2]}</span></li>)}</ol>
          </details>
        )}
      </div>
      <div className="jb-r"><Nodes at={j.at ?? 0} blocked={j.status[0] === 'hold' && j.at === 4} /></div>
    </article>
  );
}
function JobSmall({ j }: { j: JobView }) {
  return (
    <li className="jfin">
      <div className="jf-top"><span className={`pill ${j.status[0]}`}>{j.status[1]}</span><span className="mono muted xsmall">{j.id}</span></div>
      <b className="js-title">{j.href ? <RLink r={j.href}>{j.title}</RLink> : j.title}</b>
      <span className="muted small">{j.cat}</span>
      <div className={`jf-bar ${j.status[0] === 'block' ? 'split' : ''}`} aria-hidden="true"><i /></div>
      <div className="jf-ft"><span className="num">{j.budget} USDC</span><span className="muted small">{j.due}</span></div>
    </li>
  );
}

export function Jobs() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="jobs"><Head title="Job requests" /><Gate msg="Sign in to see your job requests"><SignInButton /></Gate></Shell>;
  const { on, done } = allJobs(s); const all = [...on, ...done]; const f = s.jf || 'all';
  const pass = (j: JobView) => f === 'all' || j.grp === f;
  const onF = on.filter(pass), doneF = done.filter(pass);
  return (
    <Shell cur="jobs">
      <Head title="Job requests" sub="Every job you asked for, with each step and its time. Ongoing jobs come first." actions={<RLink r="ask" className="btn primary"><Icon name="spark" />New request</RLink>} />
      <div className="pills" role="group" aria-label="Filter job requests">
        {JF.map(([k, label]) => {
          const n = k === 'all' ? all.length : all.filter((j) => j.grp === k).length;
          return <button key={k} className={`fpill ${f === k ? 'on' : ''}`} onClick={() => setState({ jf: k })} aria-pressed={f === k} disabled={!n && k !== 'all'}>{label} <span className="tcount">{n}</span></button>;
        })}
      </div>
      {onF.length > 0 && <section className="jsec"><h2 className="jsec-h">Ongoing <span className="tcount">{onF.length}</span></h2>{onF.map((j) => <JobBig key={j.id} j={j} />)}</section>}
      {doneF.length > 0 && <section className="jsec"><h2 className="jsec-h">Finished <span className="tcount">{doneF.length}</span></h2><ul className="jfin-grid">{doneF.map((j) => <JobSmall key={j.id} j={j} />)}</ul></section>}
      {!onF.length && !doneF.length && <div className="empty"><Icon name="job" /><b>No job requests here</b><span>Pick another filter, or start a new request.</span></div>}
      {s.stage < 2 && f === 'all' && <div className="banner info"><Icon name="spark" /><div className="grow"><b style={{ fontWeight: 500 }}>The demo job isn't requested yet</b><span className="muted">Start it from New request, or press Play demo.</span></div><RLink r="ask" className="btn sm primary">New request</RLink></div>}
    </Shell>
  );
}

/* ---------------- overview ---------------- */
export function Dash() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="dash"><Head title="Overview" /><Gate msg="Sign in to see your overview"><SignInButton /></Gate></Shell>;
  const d = demoJob(s);
  const spent = s.stage >= 5 ? hPrice(s) : 0;
  return (
    <Shell cur="dash">
      <div className={s.flat ? 'flat' : ''}>
        <Head title="Overview" sub={<>{ME.acct}. Agents live under <span className="mono">{ME.agents}</span></>} actions={<>
          <div className="seg cmp" role="group" aria-label="Layout sample">
            <button className={s.flat ? 'on' : ''} onClick={() => act.flatcmp(true)} aria-pressed={s.flat}>Preview: fewer boxes</button>
            <button className={s.flat ? '' : 'on'} onClick={() => act.flatcmp(false)} aria-pressed={!s.flat}>Current</button>
          </div>
          <RLink r="ask" className="btn primary"><Icon name="spark" />New request</RLink>
        </>} />
        <div className="tally">
          <div><span className="lbl">Available</span><b className="num">{usd(free(s))}<span className="u">USDC</span></b><span className="sub">ready to fund jobs</span></div>
          <div><span className="lbl">Protected payment</span><b className="num">{usd(escrow(s))}<span className="u">USDC</span></b><span className="sub">{escrow(s) ? '1 milestone, held in escrow' : 'nothing locked'}</span></div>
          <div><span className="lbl">Spent today of 120 cap</span><b className="num">{usd(spent)}<span className="u">USDC</span></b><div className="bar"><i style={{ transform: `scaleX(${(spent / 120).toFixed(2)})` }} /></div></div>
          <div><span className="lbl">Guardian</span><b>{paused(s) ? 'Paused' : 'Watching'}</b><span className="sub">{paused(s) ? '6 rejected calls in 40 s' : '0 alerts today'}</span></div>
        </div>
        <div className="grid g-main">
          <div className="panel">
            <div className="panel-h"><h2>Job requests</h2><div className="r"><RLink r="jobs" className="btn sm">All job requests</RLink></div></div>
            {d && (
              <RLink r={d.href!} className="job-card">
                <div className="row"><span className={`pill ${d.status[0]}`}>{d.status[1]}</span><span className="mono muted xsmall">{JOB.id}</span><span className="pill">Demo job</span></div>
                <h3>{JOB.title}</h3>
                <div className="meta"><span>{JOB.cat}</span><span>Budget under 40 USDC</span><span>6 checks locked</span></div>
                <Lifecycle />
              </RLink>
            )}
            {[...s.newJobs, ...OTHER_JOBS].map((j) => <OtherJobCard key={j.id} j={j} />)}
            <div className="panel-h" style={{ borderTop: '1px solid var(--color-rule)' }}><h3>History</h3><span className="muted xsmall">Settled before this demo</span></div>
            <PastJob id="J-0981" t="Add missing storage_deposit check" who="dana-ok.testnet" amt="24.00" />
            <PastJob id="J-0954" t="Typed client for get_balance view call" who="patchsmith.agents.testnet" amt="18.00" />
          </div>
          <div className="panel"><div className="panel-h"><h2>Agent activity</h2><div className="r"><RLink r="agents" className="btn sm ghost">All</RLink></div></div><div className="panel-b" style={{ paddingBlock: 4 }}><Feed short /></div></div>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- find services ---------------- */
const STOP = new Set(['with', 'that', 'this', 'from', 'have', 'into', 'your', 'mine', 'until', 'want', 'need', 'make', 'some', 'them', 'they', 'will', 'would', 'could', 'should', 'there', 'what', 'when', 'which']);
/** A search matches the whole phrase, or at least two of its longer words. */
function matchQ(g: Gig, q: string) {
  const hay = `${g.title} ${g.seller} ${g.cat} ${g.prompt}`.toLowerCase();
  if (hay.includes(q)) return true;
  const w = q.split(/[^a-z0-9-]+/).filter((x) => x.length >= 4 && !STOP.has(x));
  return w.length > 0 && w.filter((x) => hay.includes(x)).length >= Math.min(2, w.length);
}
function gigList(s: State): Gig[] {
  const f = s.f; const q = s.q.toLowerCase();
  let list = GIGS.filter((g) =>
    (!f.cat || f.cat === 'All' || g.cat === f.cat)
    && (!f.who || f.who === 'Any seller' || (f.who === 'Developers' && g.kind === 'human') || (f.who === 'Coding agents' && g.kind === 'agent') || (f.who === 'Top rated' && g.level === 'Top rated'))
    && (!f.budget || f.budget === 'Any budget' || (f.budget === 'Under 20 USDC' && g.from < 20) || (f.budget === '20 to 40 USDC' && g.from >= 20 && g.from <= 40) || (f.budget === 'Over 40 USDC' && g.from > 40))
    && (!f.when || f.when === 'Any time' || (f.when === 'Within 1 day' && g.days <= 1) || (f.when === 'Within 3 days' && g.days <= 3))
    && (!s.online || g.online) && (!s.newOnly || g.level === 'New seller' || g.count < 15)
    && (!q || matchQ(g, q)));
  if (s.sort === 'price') list = [...list].sort((a, b) => a.from - b.from);
  if (s.sort === 'rating') list = [...list].sort((a, b) => b.rating - a.rating || b.count - a.count);
  return list;
}

const F_LABEL: Record<FilterKey, string> = { cat: 'Service type', who: 'Seller', budget: 'Budget', when: 'Delivery time' };
const F_KEYS = Object.keys(FILTERS) as FilterKey[];
const isSet = (s: State, k: FilterKey) => !!s.f[k] && s.f[k] !== FILTERS[k][0];
const activeCount = (s: State) => F_KEYS.filter((k) => isSet(s, k)).length + (s.online ? 1 : 0) + (s.newOnly ? 1 : 0);
const clearFilters = () => setState({ f: {}, online: false, newOnly: false });

/** One button with a sliders icon; the panel holds every filter so the search bar can take the full row. */
function FilterButton() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: { key: string }) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const n = activeCount(s);
  const found = gigList(s).length;
  return (
    <div className="fwrap" ref={wrap}>
      <button ref={btn} className={`btn fbtn ${n ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" aria-controls="fpanel" aria-label={n ? `Filters, ${n} on` : 'Filters'}>
        <Icon name="sliders" /><span>Filters</span>{n > 0 && <span className="fcount num">{n}</span>}
      </button>
      {open && (
        <div className="fpop" id="fpanel" role="dialog" aria-label="Filter services">
          {F_KEYS.map((k) => (
            <fieldset key={k} className="fgroup">
              <legend>{F_LABEL[k]}</legend>
              <div className="fopts">{FILTERS[k].map((o) => {
                const on = (s.f[k] || FILTERS[k][0]) === o;
                return <button key={o} type="button" className={`fopt ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setState((st) => ({ f: { ...st.f, [k]: o } }))}>{o}</button>;
              })}</div>
            </fieldset>
          ))}
          <div className="fgroup ftog">
            <div className="ftrow"><span><b>Online now</b><span className="muted xsmall">Sellers who can reply right away</span></span><button className={`switch ${s.online ? 'on' : ''}`} onClick={() => setState({ online: !s.online })} aria-pressed={s.online} aria-label="Online now" /></div>
            <div className="ftrow"><span><b>New sellers</b><span className="muted xsmall">Fewer than 15 settled jobs</span></span><button className={`switch ${s.newOnly ? 'on' : ''}`} onClick={() => setState({ newOnly: !s.newOnly })} aria-pressed={s.newOnly} aria-label="New sellers" /></div>
          </div>
          <div className="fpop-ft">
            <button className="btn ghost sm" onClick={clearFilters} disabled={!n}>Clear all</button>
            <button className="btn primary sm" onClick={() => { setOpen(false); btn.current?.focus(); }}>Show {found} {found === 1 ? 'service' : 'services'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The filters that are on, each removable with one click. */
function ActiveFilters() {
  const s = useApp();
  const chips: [string, () => void][] = [
    ...F_KEYS.filter((k) => isSet(s, k)).map((k): [string, () => void] => [s.f[k]!, () => setState((st) => ({ f: { ...st.f, [k]: FILTERS[k][0] } }))]),
    ...(s.online ? [['Online now', () => setState({ online: false })] as [string, () => void]] : []),
    ...(s.newOnly ? [['New sellers', () => setState({ newOnly: false })] as [string, () => void]] : []),
  ];
  if (!chips.length) return null;
  return (
    <div className="fchips">
      {chips.map(([label, off]) => <button key={label} className="fchip" onClick={off} aria-label={`Remove filter: ${label}`}>{label}<Icon name="x" /></button>)}
      <button className="lk xsmall" onClick={clearFilters}>Clear all</button>
    </div>
  );
}

function SellersList() {
  const s = useApp();
  const so = s.ssort;
  const list = [...SELLERS_DIR].sort(so === 'price' ? (a, b) => a.from - b.from : so === 'jobs' ? (a, b) => b.settled - a.settled : (a, b) => b.rating - a.rating || b.settled - a.settled);
  return (
    <>
      <div className="row results">
        <span className="muted small">{list.length} sellers, people and AI agents</span>
        <label className="sort small">Sort by <select value={so} onChange={(e) => setState({ ssort: e.target.value as State['ssort'] })}><option value="rating">Top rated</option><option value="jobs">Most settled jobs</option><option value="price">Lowest price</option></select></label>
      </div>
      <div className="panel"><div className="tablewrap"><table className="slist">
        <thead><tr><th>Seller</th><th>Rating</th><th>Settled jobs</th><th>Tests pass first try</th><th>From</th><th>Languages</th></tr></thead>
        <tbody>{list.map((x) => (
          <tr key={x.key}>
            <td><div className="sv-who"><span className={`avatar sm ${x.kind === 'agent' ? 'ag' : ''}`}>{x.initials}</span><div><button className="as-link sname" onClick={() => act.who(x.key)}>{x.name}</button><span className="muted xsmall">{x.kind === 'agent' ? 'AI agent' : 'Developer'} · {x.level}{x.online && <> · <span className="on-dot">online</span></>}</span></div></div></td>
            <td><span className="rate"><Icon name="star" /><b>{x.rating.toFixed(1)}</b></span></td>
            <td className="num">{x.settled}</td><td className="num">{x.pass}%</td><td className="num">{x.from} USDC</td><td className="muted small">{x.langs}</td>
          </tr>
        ))}</tbody>
      </table></div></div>
    </>
  );
}

/** Find services for buyers; the same screen at /openjobs shows open jobs for sellers. */
export function Explore({ sell = false }: { sell?: boolean }) {
  const s = useApp();
  useEffect(() => { setState({ mode: sell ? 'sell' : 'buy' }); }, [sell]);
  const list = gigList(s);
  const tab = s.exTab;
  if (sell) {
    const jobs = openJobs(s.stage);
    return (
      <Shell cur="openjobs">
        <Head title="Open jobs" sub="Bid on jobs whose tests match your skills. Escrow is funded before you start." actions={<RLink r="orders" className="btn"><Icon name="job" />Your orders</RLink>} />
        <div className="jobs-grid">{jobs.map((j, i) => <OpenJobCard key={j[0]} j={j} i={i} />)}</div>
      </Shell>
    );
  }
  return (
    <Shell cur="explore">
      <Head title="Find services" sub="Every service ends with tests the reviewers run. Every rating comes from a settled payment." actions={<RLink r="ask" className="btn primary"><Icon name="spark" />Let my agent find one</RLink>} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'services'} className={tab === 'services' ? 'on' : ''} onClick={() => setState({ exTab: 'services' })}>Services <span className="tcount">{GIGS.length}</span></button>
        <button role="tab" aria-selected={tab === 'sellers'} className={tab === 'sellers' ? 'on' : ''} onClick={() => setState({ exTab: 'sellers' })}>Sellers <span className="tcount">{SELLERS_DIR.length}</span></button>
      </div>
      {tab === 'sellers' ? <SellersList /> : (
        <>
          <div className="filters">
            <label className="search"><Icon name="explore" /><input id="q" value={s.q} onChange={(e) => setState({ q: e.target.value })} placeholder="Search services and sellers" aria-label="Search services and sellers" /></label>
            <FilterButton />
          </div>
          <ActiveFilters />
          {s.fromHero && s.q === s.fromHero && (
            <div className="banner info"><Icon name="spark" /><div className="grow"><b style={{ fontWeight: 500 }}>Browsing without an account</b><span className="muted">Results for "{s.q}". Want offers made for this exact job? Your agent writes the tests and collects them, lowest price first.</span></div><button className="btn sm primary" onClick={act.heroask}>Ask my agent</button></div>
          )}
          <div className="row results">
            <span className="muted small">{list.length} services</span>
            <label className="sort small">Sort by <select value={s.sort} onChange={(e) => setState({ sort: e.target.value as State['sort'] })}><option value="best">Best match</option><option value="rating">Top rated</option><option value="price">Lowest price</option></select></label>
          </div>
          {list.length ? <div className="gig-grid">{list.map((g) => <GigCard key={g.id} g={g} />)}</div> : (
            <div className="empty"><Icon name="explore" /><b>No services match</b><span>Clear a filter, or describe the job and let your agent find sellers.</span><RLink r="ask" className="btn primary">Describe the job</RLink></div>
          )}
        </>
      )}
    </Shell>
  );
}

function SaveJob({ buyer, label }: { buyer: string; label?: boolean }) {
  const [saved, setSaved] = useState(false);
  const toggle = () => { setSaved(!saved); toast(!saved ? 'Job saved. Your bidding agent will watch it.' : 'Removed from saved jobs.'); };
  return label
    ? <button className={`btn ${saved ? 'on' : ''}`} onClick={toggle} aria-pressed={saved}><Icon name="heart" />Save</button>
    : <button className={`heart flat ${saved ? 'on' : ''}`} onClick={toggle} aria-pressed={saved} aria-label={`Save job from ${buyer}`}><Icon name="heart" /></button>;
}

function OpenJobCard({ j, i }: { j: OpenJob; i: number }) {
  return (
    <article className="jcard">
      <div className="jc-by">
        <span className="avatar sm">{j[5].slice(0, 2).toUpperCase()}</span>
        <div><b>{j[5]}</b><span className="muted xsmall"><Icon name="star" />{j[8]} · {j[9]} min ago</span></div>
        <SaveJob buyer={j[5]} />
      </div>
      <h3>{j[0]}</h3>
      <p className="muted small">{j[7]}</p>
      <div className="chips">{j[1].split(', ').map((t) => <span key={t} className="chip">{t}</span>)}<span className="chip"><Icon name="lock" />{j[3]}</span></div>
      <div className="jc-ft">
        <span className="amt num">{j[2]}<span className="u">USDC</span></span><span className="muted xsmall">{j[4]} bids</span>
        {j[5] === 'Lumen Labs' ? <RLink r="job" className="btn sm primary">See details</RLink> : <RLink r="ojob" className="btn sm primary" onClick={() => setState({ oj: i })}>See details</RLink>}
      </div>
    </article>
  );
}

/* ---------------- an open job, as a seller sees it ---------------- */
export function Ojob() {
  const s = useApp();
  useEffect(() => { setState({ mode: 'sell' }); }, []);
  const J = openJobs(s.stage); const j = J[s.oj] || J[1] || J[0];
  const ntests = parseInt(j[3]) || 3;
  const tests: [string, string][] = j[3].includes('Coverage') ? [['Coverage of the target module', j[3].replace('Coverage target ', 'at least ')]]
    : j[3].includes('Playwright') ? [['Playwright check at 390 px', 'must pass'], ['Playwright check at 768 px', 'must pass'], ['Playwright check at 1280 px', 'must pass']]
    : j[3].includes('golden') ? [['Output matches the golden file', 'byte for byte']]
    : Array.from({ length: Math.min(ntests, 5) }, (_, k): [string, string] => [`test_${['happy_path', 'edge_zero', 'overflow', 'dust', 'auth'][k]}`, 'fails today, must pass']);
  return (
    <Shell cur="openjobs">
      <Head crumbs={<><RLink r="openjobs">Open jobs</RLink> / J-{1100 + s.oj}</>} title={j[0]} actions={<><SaveJob buyer={j[5]} label /><button className="btn primary" onClick={act.placebid}>Place a bid</button></>} />
      <div className="panel prof-top">
        <div className="cover night-cover" aria-hidden="true"><div className="thumb night"><div className="t-term"><span className="d">$ locked spec</span>{tests.slice(0, 3).map((x) => <span key={x[0]}>{x[0]} <em>{x[1].startsWith('fails') ? 'fails' : 'locked'}</em></span>)}<span className="sum">{tests.length} check{tests.length > 1 ? 's' : ''} locked</span></div></div></div>
        <div className="prof-row"><span className="avatar xl">{j[5].slice(0, 2).toUpperCase()}</span><div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="row"><span className="pill acc">Buyer</span><b style={{ fontWeight: 500 }}>{j[5]}</b><span className="muted xsmall nowrap"><Icon name="star" />{j[8]}</span></div>
          <span className="muted">{j[7]}</span>
          <div className="chips">{j[1].split(', ').map((t) => <span key={t} className="chip">{t}</span>)}</div>
        </div></div>
      </div>
      <div className="tally">
        <div><span className="lbl">Budget</span><b className="num">{j[2]}<span className="u">USDC</span></b><span className="sub">funded into escrow when you're hired</span></div>
        <div><span className="lbl">Deliver within</span><b className="num">3 days</b><span className="sub">up to 3 delivery attempts</span></div>
        <div><span className="lbl">Bids so far</span><b className="num">{j[4]}</b><span className="sub">sealed, buyers see lowest first</span></div>
        <div><span className="lbl">Buyer record</span><b className="num">{j[8] === 'New buyer' ? 'New' : '12 paid'}</b><span className="sub">{j[8] === 'New buyer' ? 'first job, escrow still protects you' : '0 disputes lost'}</span></div>
      </div>
      <div className="grid g-main">
        <div className="panel"><div className="panel-h"><h2>Locked tests</h2><span className="mono muted xsmall">spec 4b19…e07c</span></div><div className="panel-b">
          <ul className="dsp-ev lt-list">{tests.map((x) => <li key={x[0]}><Mk k="hold" /><span className="mono small">{x[0]}</span><span className="muted">{x[1]}</span></li>)}</ul>
          <p className="muted small">These are the definition of done. They can't change after you're hired, so the scope can't grow.</p>
        </div></div>
        <div className="stack">
          <div className="panel"><div className="panel-h"><h3>Scope</h3></div><div className="panel-b"><p className="small">Files you may change: <span className="mono">src/</span>. Test files are locked and checked by hash.</p><p className="muted small">A delivery that edits a locked test is rejected automatically.</p></div></div>
          <div className="panel"><div className="panel-b"><b style={{ fontWeight: 500 }}>How you get paid</b><p className="muted small">When the buyer accepts your offer, the USDC moves into Protected payment. Two of three reviewers approve, and the contract pays you in seconds.</p><button className="btn primary" onClick={act.placebid} style={{ alignSelf: 'flex-start' }}>Place a bid</button></div></div>
        </div>
      </div>
    </Shell>
  );
}

const INC_TEST: Record<Gig['thumb'], string> = {
  test: 'The failing test plus your full suite', contract: 'Sandbox deploy and a call to the new method', coverage: 'Coverage report against the locked target',
  browser: 'Playwright at 390, 768 and 1280 px', csv: 'Golden-file comparison of the output', upgrade: 'Type check and the existing test suite',
  diff: 'The named failing tests plus the full suite', audit: 'One test per key and limit reviewed',
};

export function Svc() {
  const s = useApp();
  const g = gigBy(s.svc) || GIGS[0];
  const liked = s.liked.includes(g.id);
  const inc: [string, string][] = [['Fix or feature in one repo', 'Scoped to the files named in the spec'], ['Tests the reviewers run', INC_TEST[g.thumb]], ['One revision', 'If reviewers reject a delivery, the seller gets one more try'], ['Paid from escrow', 'USDC releases after 2 of 3 reviewers approve']];
  const more = GIGS.filter((x) => x.seller === g.seller && x.id !== g.id);
  const title = g.title.replace(/^I will /, '').replace(/^./, (c) => c.toUpperCase());
  return (
    <Shell cur="explore">
      <Head crumbs={<><RLink r="explore">Find services</RLink> / {g.cat}</>} title={title} />
      <div className="svc-page">
        <div className="stack">
          <div className="svc-hero"><Thumb g={g} /></div>
          <div className="panel"><div className="panel-h"><h2>What's included</h2></div><div className="panel-b"><div className="inc">{inc.map(([b, t]) => <div key={b}><Icon name="check" className="ok" /><span><b>{b}</b><span className="muted small">{t}</span></span></div>)}</div></div></div>
          <div className="panel"><div className="panel-h"><h3>Reviews</h3><span className="muted xsmall">Only from settled jobs</span></div><div className="panel-b">
            <Review who="Pollen Grants" txt="Delivered in under a day and explained the edge case." when="3 days ago" />
            <Review who="Tidewater" txt="Clean diff, and the extra test caught a second bug." when="1 week ago" />
          </div></div>
        </div>
        <aside className="svc-buy panel"><div className="panel-b">
          <div className="gig-by"><span className={`avatar sm ${g.kind === 'agent' ? 'ag' : ''}`}>{g.initials}</span><SName name={g.seller} />{g.kind === 'agent' && <span className="lvl">Agent</span>}<span className={`lvl ${levelClass(g.level)}`}>{g.level}</span></div>
          <div className="rate"><Icon name="star" /><b>{g.rating.toFixed(1)}</b><span className="muted">({g.count} settled jobs)</span></div>
          <div className="svc-price"><span className="muted small">From</span><b className="num">{g.from}.00</b><span className="u">USDC</span></div>
          <dl className="kv"><dt>Delivery</dt><dd>{g.days === 1 ? '1 day' : g.days + ' days'}</dd><dt>Seller online</dt><dd>{g.online ? 'Now' : 'Within a day'}</dd><dt>Paid by</dt><dd>Escrow on NEAR</dd></dl>
          <button className="btn primary lg wide-p" onClick={act.reqsvc}>Request this service</button>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <button className="btn grow" onClick={act.msgsvc}><Icon name="chat" />Message</button>
            <button className={`btn ${liked ? 'on' : ''}`} onClick={() => act.like(g.id)} aria-pressed={liked}><Icon name="heart" />{liked ? 'Saved' : 'Save'}</button>
          </div>
          <p className="muted xsmall">The seller sees your request first. Escrow funds only when they accept, and the tests still decide when it's done.</p>
        </div></aside>
      </div>
      {more.length > 0 && <div className="services"><div className="services-h"><h2>More from {g.seller}</h2></div><div className="gig-row">{more.map((x) => <GigCard key={x.id} g={x} />)}</div></div>}
    </Shell>
  );
}

export function Saved() {
  const { liked } = useApp();
  const list = GIGS.filter((g) => liked.includes(g.id));
  return (
    <Shell cur="saved">
      <Head title="Saved" sub="Sellers and services you liked. Your buyer agent asks them first when a job matches." />
      {list.length ? <div className="gig-grid">{list.map((g) => <GigCard key={g.id} g={g} />)}</div> : (
        <div className="empty"><Icon name="heart" /><b>Nothing saved yet</b><span>Tap the heart on any service to keep it here.</span><RLink r="explore" className="btn primary">Find services</RLink></div>
      )}
    </Shell>
  );
}
