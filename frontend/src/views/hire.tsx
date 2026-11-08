import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FILTERS, GIGS, gigBy, JOB, ME, OPEN_JOBS, SPEC, usd, type FilterKey, type Gig } from '../data/sample';
import { act } from '../store/actions';
import { escrow, free, getState, paused, setState, toast, useApp, type State } from '../store/store';
import { Icon } from '../ui/icons';
import { allOtherJobs, Feed, Gate, GigCard, Head, levelClass, Lifecycle, OtherJobCard, PastJob, POPULAR, Review, RLink, SignInButton, T, Thumb, Tl } from '../ui/parts';
import { Shell } from '../ui/Shell';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const SUGG = ['Fix the failing test in payroll-vault', 'Add pagination to get_jobs', 'Write tests for the refund callback', 'Fix the Safari wallet modal'];

/* ---------------- buyer home: one prompt ---------------- */
export function Ask() {
  const s = useApp();
  const input = useRef<HTMLTextAreaElement>(null);
  if (s.stage < 1) return <Shell cur="ask"><Head title="New request" /><Gate msg="Sign in to start a request"><SignInButton /></Gate></Shell>;
  const submit = () => act.submitAsk(getState().draft.trim());
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
  const pick = (t: string) => { setState({ draft: t }); requestAnimationFrame(() => input.current?.focus()); };
  return (
    <Shell cur="ask">
      <div className="ask">
        <div className="ask-head"><span className="muted">{greeting()}, {ME.name}</span><h1>What should we get built?</h1></div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="visually-hidden" htmlFor="ask-in">Describe the job</label>
          <textarea id="ask-in" ref={input} rows={3} value={s.draft} onChange={(e) => setState({ draft: e.target.value })} onKeyDown={onKey} placeholder="Describe a bug, a test or a small feature. Paste a repo link if you have one." />
          <div className="bar2">
            <button type="button" className="btn sm" onClick={act.attachrepo}><Icon name="repo" />Add repository</button>
            <button type="button" className="chip" title="Planned second category" disabled>Translation, soon</button>
            <span className="muted xsmall">Budget limit stays private to your agent</span>
            <button type="submit" className="btn primary send" aria-label="Send to the spec writer"><Icon name="up" /></button>
          </div>
        </form>
        <div className="sugg">{SUGG.map((t) => <button key={t} className="chip" onClick={() => pick(t)}>{t}</button>)}</div>
        <div className="services">
          <div className="services-h">
            <h2>Popular services</h2><span className="muted small">Each one ends with a test the reviewers can run</span>
            <RLink r="explore" className="see-all">See all <Icon name="ext" /></RLink>
          </div>
          <div className="gig-row" tabIndex={0} aria-label="Popular services, scroll sideways">{POPULAR.map((g) => <GigCard key={g.id} g={g} />)}</div>
          <p className="muted xsmall">Sellers, prices and ratings are sample data for this prototype.</p>
        </div>
        <div className="ask-foot"><span><Icon name="flask" />Tests written for you</span><span><Icon name="lock" />Paid only from escrow</span><span><Icon name="shield" />Agents stay inside your limits</span></div>
      </div>
    </Shell>
  );
}

const jobStatus = (stage: number): [string, string] => stage >= 7 ? ['ok', 'Settled'] : stage >= 6 ? ['hold', 'Revision requested'] : stage >= 5 ? ['acc', 'In escrow'] : stage >= 4 ? ['info', 'Offer agreed'] : stage >= 3 ? ['info', '4 bids, 2 held'] : ['', 'Waiting for bids'];
const demoJobRoute = (stage: number) => (stage >= 5 ? 'room' : stage >= 4 ? 'chat' : 'job');

function DemoJobCard({ s }: { s: State }) {
  const st = jobStatus(s.stage);
  return (
    <RLink r={demoJobRoute(s.stage)} className="job-card">
      <div className="row"><span className={`pill ${st[0]}`}>{st[1]}</span><span className="mono muted xsmall">{JOB.id}</span><span className="pill">Demo job</span></div>
      <h3>{JOB.title}</h3>
      <div className="meta"><span>{JOB.cat}</span><span>Budget under 40 USDC</span><span>6 checks locked</span></div>
      <Lifecycle />
    </RLink>
  );
}

export function Dash() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="dash"><Head title="Overview" /><Gate msg="Sign in to see your overview"><SignInButton /></Gate></Shell>;
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
        <div><span className="lbl">In escrow</span><b className="num">{usd(escrow(s))}<span className="u">USDC</span></b><span className="sub">{escrow(s) ? '1 milestone' : 'nothing locked'}</span></div>
        <div><span className="lbl">Spent today of 120 cap</span><b className="num">{s.stage >= 5 ? '32.00' : '0.00'}<span className="u">USDC</span></b><div className="bar"><i style={{ transform: `scaleX(${s.stage >= 5 ? 0.27 : 0})` }} /></div></div>
        <div><span className="lbl">Guardian</span><b>{paused(s) ? 'Paused' : 'Watching'}</b><span className="sub">{paused(s) ? '6 rejected calls in 40 s' : '0 alerts today'}</span></div>
      </div>
      <div className="grid g-main">
        <div className="panel">
          <div className="panel-h"><h2>Jobs</h2><div className="r"><RLink r="explore" className="btn sm">Browse talent</RLink></div></div>
          {s.stage >= 2 && <DemoJobCard s={s} />}
          {allOtherJobs().map((j) => <OtherJobCard key={j.id} j={j} />)}
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

export function Jobs() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="jobs"><Head title="Your jobs" /><Gate msg="Sign in to see your jobs"><SignInButton /></Gate></Shell>;
  return (
    <Shell cur="jobs">
      <Head title="Your jobs" sub="Post as many as you like. Your daily cap in Limits and keys is the only limit." actions={<RLink r="ask" className="btn primary"><Icon name="spark" />New request</RLink>} />
      <div className="panel">
        {s.stage >= 2 ? <DemoJobCard s={s} /> : (
          <div className="job-card">
            <div className="row"><span className="pill">Not posted yet</span><span className="mono muted xsmall">J-1042</span><span className="pill">Demo job</span></div>
            <h3>{JOB.title}</h3>
            <div className="meta"><span>Start the demo from New request, or press Play demo.</span></div>
          </div>
        )}
        {allOtherJobs().map((j) => <OtherJobCard key={j.id} j={j} />)}
      </div>
    </Shell>
  );
}

/* ---------------- find services ---------------- */
function gigList(s: State): Gig[] {
  const f = s.f; const q = s.q.toLowerCase();
  let list = GIGS.filter((g) =>
    (!f.cat || f.cat === 'All' || g.cat === f.cat)
    && (!f.who || f.who === 'Any seller' || (f.who === 'Developers' && g.kind === 'human') || (f.who === 'Coding agents' && g.kind === 'agent') || (f.who === 'Top rated' && g.level === 'Top rated'))
    && (!f.budget || f.budget === 'Any budget' || (f.budget === 'Under 20 USDC' && g.from < 20) || (f.budget === '20 to 40 USDC' && g.from >= 20 && g.from <= 40) || (f.budget === 'Over 40 USDC' && g.from > 40))
    && (!f.when || f.when === 'Any time' || (f.when === 'Within 1 day' && g.days <= 1) || (f.when === 'Within 3 days' && g.days <= 3))
    && (!s.online || g.online) && (!s.newOnly || g.level === 'New seller' || g.count < 15)
    && (!q || `${g.title} ${g.seller} ${g.cat}`.toLowerCase().includes(q)));
  if (s.sort === 'price') list = [...list].sort((a, b) => a.from - b.from);
  if (s.sort === 'rating') list = [...list].sort((a, b) => b.rating - a.rating || b.count - a.count);
  return list;
}

function Select({ k, label }: { k: FilterKey; label: string }) {
  const { f } = useApp();
  const v = f[k] || FILTERS[k][0];
  return (
    <label className="dd"><span className="visually-hidden">{label}</span>
      <select value={v} onChange={(e) => setState((s) => ({ f: { ...s.f, [k]: e.target.value } }))}>{FILTERS[k].map((o) => <option key={o}>{o}</option>)}</select>
      <Icon name="chev" />
    </label>
  );
}

/** Find services for buyers; the same screen at /openjobs shows open jobs for sellers. */
export function Explore({ sell = false }: { sell?: boolean }) {
  const s = useApp();
  useEffect(() => { setState({ mode: sell ? 'sell' : 'buy' }); }, [sell]);
  const list = gigList(s);
  const jobs = s.stage >= 2 ? [['Make test_split_rounding pass in split_payment()', 'Smart contracts, Rust', 'under 40', '2 failing tests', s.stage >= 3 ? 6 : 0, 'Lumen Labs', true, 'The payroll contract loses 1 unit when splitting USDC. Make the named test pass without touching others.', '4.9 buyer', 3] as const, ...OPEN_JOBS] : OPEN_JOBS;
  return (
    <Shell cur={sell ? 'openjobs' : 'explore'}>
      {sell
        ? <Head title="Open jobs" sub="Bid on jobs whose tests match your skills. Escrow is funded before you start." actions={<RLink r="orders" className="btn"><Icon name="job" />Your orders</RLink>} />
        : <Head title="Find services" sub="Every service ends with tests the reviewers run. Every rating comes from a settled payment." actions={<RLink r="ask" className="btn primary"><Icon name="spark" />Let my agent find one</RLink>} />}
      {!sell ? (
        <>
          <div className="filters">
            <label className="search"><Icon name="explore" /><input id="q" value={s.q} onChange={(e) => setState({ q: e.target.value })} placeholder="Search services and sellers" aria-label="Search services and sellers" /></label>
            <Select k="cat" label="Service type" /><Select k="who" label="Seller details" /><Select k="budget" label="Budget" /><Select k="when" label="Delivery time" />
            <div className="toggles">
              <button className={`switch ${s.online ? 'on' : ''}`} onClick={() => setState({ online: !s.online })} aria-pressed={s.online} aria-label="Online now" /><span className="small">Online now</span>
              <button className={`switch ${s.newOnly ? 'on' : ''}`} onClick={() => setState({ newOnly: !s.newOnly })} aria-pressed={s.newOnly} aria-label="New sellers" /><span className="small">New sellers</span>
            </div>
          </div>
          <div className="row results">
            <span className="muted small">{list.length} services</span>
            <label className="sort small">Sort by <select value={s.sort} onChange={(e) => setState({ sort: e.target.value as State['sort'] })}><option value="best">Best match</option><option value="rating">Top rated</option><option value="price">Lowest price</option></select></label>
          </div>
          {list.length ? <div className="gig-grid">{list.map((g) => <GigCard key={g.id} g={g} />)}</div> : (
            <div className="empty"><Icon name="explore" /><b>No services match</b><span>Clear a filter, or describe the job and let your agent find sellers.</span><RLink r="ask" className="btn primary">Describe the job</RLink></div>
          )}
        </>
      ) : (
        <div className="jobs-grid">
          {jobs.map((j) => <OpenJobCard key={j[0]} j={j} />)}
        </div>
      )}
    </Shell>
  );
}

function OpenJobCard({ j }: { j: readonly [string, string, string, string, number, string, boolean, string, string, number] }) {
  const [saved, setSaved] = useState(false);
  const toggleSave = () => {
    setSaved(!saved);
    toast(!saved ? 'Job saved. Your bidding agent will watch it.' : 'Removed from saved jobs.');
  };
  return (
    <article className="jcard">
      <div className="jc-by">
        <span className="avatar sm">{j[5].slice(0, 2).toUpperCase()}</span>
        <div><b>{j[5]}</b><span className="muted xsmall"><Icon name="star" />{j[8]} · {j[9]} min ago</span></div>
        <button className={`heart flat ${saved ? 'on' : ''}`} onClick={toggleSave} aria-pressed={saved} aria-label="Save job"><Icon name="heart" /></button>
      </div>
      <h3>{j[0]}</h3>
      <p className="muted small">{j[7]}</p>
      <div className="chips">{j[1].split(', ').map((t) => <span key={t} className="chip">{t}</span>)}<span className="chip"><Icon name="lock" />{j[3]}</span></div>
      <div className="jc-ft"><span className="amt num">{j[2]}<span className="u">USDC</span></span><span className="muted xsmall">{j[4]} bids</span><RLink r={j[5] === 'Lumen Labs' ? 'job' : 'seller'} className="btn sm primary">See details</RLink></div>
    </article>
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
          <div className="gig-by"><span className={`avatar sm ${g.kind === 'agent' ? 'ag' : ''}`}>{g.initials}</span><b>{g.seller}</b>{g.kind === 'agent' && <span className="lvl">Agent</span>}<span className={`lvl ${levelClass(g.level)}`}>{g.level}</span></div>
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

/* ---------------- post a job ---------------- */
export function SpecTable() {
  return (
    <div className="tablewrap"><table>
      <thead><tr><th>Check</th><th>How reviewers verify it</th><th>Weight</th></tr></thead>
      <tbody>{SPEC.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="muted">{r[1]}</td><td><span className={`pill ${r[2] === 'Required' ? 'acc' : ''}`}>{r[2]}</span></td></tr>)}</tbody>
    </table></div>
  );
}

export function Post() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="post"><Head title="Post a job" /><Gate msg="Sign in to post a job"><SignInButton label="Sign in with Google or email" /></Gate></Shell>;
  const done = s.stage >= 2;
  const gen = s.specGen || done;
  return (
    <Shell cur="post">
      <Head crumbs={<><RLink r="ask">New request</RLink> / Post a job</>} title="Post a job" sub="Write it the way you would explain it to a colleague. The spec writer turns it into tests that decide when it is done." />
      <div className="grid g-main">
        <div className="stack">
          <div className="panel"><div className="panel-h"><span className="pill acc">Step 1</span><h2>Describe the work</h2></div><div className="panel-b">
            <div className="field"><label htmlFor="f-title">Title</label><input className="input" id="f-title" defaultValue={JOB.title} /></div>
            <div className="field"><label htmlFor="f-repo">Repository and base commit</label><div className="row" style={{ flexWrap: 'nowrap' }}><input className="input" id="f-repo" defaultValue={JOB.repo} /><input className="input mono" id="f-base" defaultValue={JOB.base} style={{ maxWidth: 120 }} aria-label="Base commit" /></div></div>
            <div className="field"><label htmlFor="f-desc">What's wrong and what done looks like</label><textarea className="input" id="f-desc" defaultValue={s.draft || JOB.plain} /></div>
            <div className="grid g-2">
              <div className="field"><label htmlFor="f-cat">Category</label><select className="input" id="f-cat"><option>Smart contracts, Rust</option><option>Front-end, React</option><option>Tests</option><option>Scripts</option></select></div>
              <div className="field"><label htmlFor="f-when">Deliver within</label><select className="input" id="f-when"><option>2 days</option><option>1 day</option><option>1 week</option></select></div>
            </div>
            {!gen && <button className="btn primary lg" onClick={act.genspec} style={{ alignSelf: 'flex-start' }}><Icon name="spark" />Write the tests for me</button>}
          </div></div>
          {gen && (
            <>
              <div className="panel"><div className="panel-h"><span className="pill acc">Step 2</span><h2>Check the acceptance spec</h2><div className="r"><T name="NEAR AI Cloud" tip="Spec writer reasons inside a TEE" /></div></div><div className="panel-b">
                <p className="muted">The spec writer read the repo at <span className="mono">{JOB.base}</span> and wrote two tests that fail today. Reviewers will run exactly these. Once you post, the spec is hashed and can't change.</p>
                <div className="code">
                  <span className="cm">// tests/split.rs, added by spec writer, fails on {JOB.base}</span>
                  {'\n#[test]\nfn test_split_rounding() {\n    let paid = split_payment('}<span className="add">1_000_000</span>{', &[w1, w2, w3]); '}<span className="cm">// 1.000000 USDC</span>
                  {'\n    assert_eq!(paid.iter().sum::<u128>(), '}<span className="add">1_000_000</span>{'); '}<span className="cm">// today: 999_999</span>
                  {'\n}\n#[test]\nfn test_split_dust_to_last() {\n    let paid = split_payment('}<span className="add">100</span>{', &[w1, w2, w3]);\n    assert_eq!(paid, vec!['}<span className="add">33, 33, 34</span>{']); '}<span className="cm">// remainder goes to last worker</span>{'\n}'}
                </div>
                <SpecTable />
              </div></div>
              <div className="panel"><div className="panel-h"><span className="pill acc">Step 3</span><h2>Budget and milestones</h2></div><div className="panel-b">
                <div className="grid g-2">
                  <div className="field"><label htmlFor="f-max">Your private limit</label><input className="input num" id="f-max" defaultValue="38.00 USDC" /><span className="hint">Only your buyer agent sees this, inside a secure enclave. Sellers see "under 40".</span></div>
                  <div className="field"><label htmlFor="f-ms">Milestones</label><select className="input" id="f-ms"><option>1 milestone, 100% on passing review</option><option>2 milestones, 70 / 30</option></select><span className="hint">Amounts are fixed when you accept an offer.</span></div>
                </div>
                <div className="banner info"><Icon name="mandate" /><div className="grow"><b style={{ fontWeight: 500 }}>Within your limits</b><span className="muted">Per-job cap 50 USDC, daily cap 120 USDC, smart contracts allowed.</span></div><RLink r="mandate" className="btn sm">Edit limits</RLink></div>
                {done ? (
                  <div className="banner ok"><Icon name="check" /><div className="grow"><b style={{ fontWeight: 500 }}>Posted as {JOB.id}</b><span className="muted">Spec hash <span className="mono">{JOB.specHash}</span> stored on-chain. Seller agents are being notified.</span></div><RLink r="job" className="btn sm primary">View bids</RLink></div>
                ) : (
                  <div className="row"><button className="btn primary lg" onClick={act.postjob}>Post job and lock spec</button><span className="muted xsmall">Posting is free. Gas is paid by the AGORA relayer.</span></div>
                )}
              </div></div>
            </>
          )}
        </div>
        <div className="stack">
          <div className="panel"><div className="panel-h"><h3>What happens next</h3></div><div className="panel-b"><div className="tl">
            <Tl k={done ? 'ok' : 'now'} h="Spec locked" p="Hash stored with the job. Tests can't be edited later." n="1" />
            <Tl k={done ? 'now' : ''} h="Bids arrive" p="Developers and seller agents bid. Lures and outlier prices are held." n="2" />
            <Tl k="" h="Your agent picks and asks" p="It waits for 3 offers, negotiates, then opens a chat with its pick." n="3" />
            <Tl k="" h="Escrow and review" p="Money locks at acceptance. 2 of 3 reviewer approvals release it." n="4" />
          </div></div></div>
          <div className="panel"><div className="panel-b"><b style={{ fontWeight: 500 }}>Have a failing test already?</b><p className="muted small">Paste its name in the description and the spec writer will reuse it instead of writing a new one.</p></div></div>
        </div>
      </div>
    </Shell>
  );
}
