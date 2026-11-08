import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { ATTACK, BIDS, HERO_CATS, HS, ME, REVIEWERS, usd, WALK } from '../data/sample';
import { usePrefersReducedMotion } from '../lib/motion';
import { act, go } from '../store/actions';
import { setState, useApp } from '../store/store';
import { Icon, Logo } from '../ui/icons';
import { Check, RLink } from '../ui/parts';
import { AgentNetwork } from './AgentNetwork';

/** In-page anchor that scrolls smoothly (or instantly with reduced motion). */
function ScrollLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(to)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return <a href={`#${to}`} className={className} onClick={onClick}>{children}</a>;
}

function LandingNav() {
  const { stage } = useApp();
  return (
    <nav className="lnav" aria-label="Site"><div className="container"><div className="bar3">
      <RLink r="home" className="brand"><span className="brand-mark"><Logo /></span><span className="brand-name">AGORA</span></RLink>
      <div className="links">
        <ScrollLink to="how">How it works</ScrollLink>
        <RLink r="explore">Find services</RLink>
        <ScrollLink to="students">Students</ScrollLink>
        <ScrollLink to="stack">Built on NEAR</ScrollLink>
      </div>
      <div className="acts2">
        {stage >= 1 ? (
          <>
            <RLink r="jobs" className="lk">Job requests</RLink>
            <RLink r="ask" className="btn primary">Open the app</RLink>
            <RLink r="profile" className="me-btn" aria-label="Your profile"><span className="avatar">{ME.initials}</span><i className="online" aria-hidden="true" /></RLink>
          </>
        ) : (
          <>
            <button className="btn glassy demo" onClick={act.tour}><Icon name="play" />Demo</button>
            <a className="lk" href="/sell" onClick={(e) => { e.preventDefault(); act.signsell(); }}>Become a seller</a>
            <button className="btn primary si" onClick={act.signin}>Sign in</button>
          </>
        )}
      </div>
    </div></div></nav>
  );
}

/** One search bar with popular requests under it, inside the liquid glass panel. */
function HeroSearch() {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const focus = () => input.current?.focus();
  const submit = (e: FormEvent) => { e.preventDefault(); act.heroGo(q.trim(), focus); };
  return (
    <form className="hsearch" role="search" onSubmit={submit}>
      <div className="hs-in">
        <Icon name="explore" className="hs-ic" />
        <label className="visually-hidden" htmlFor="hero-in">Search services, or describe the job</label>
        <input id="hero-in" ref={input} autoComplete="off" placeholder="Search services, or describe a bug or small feature" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="hs-go" aria-label="Search"><Icon name="arrow" /></button>
      </div>
      <div className="hs-pop"><span>Popular:</span>{HS.quick.map((t) => <button key={t} type="button" className="hs-chip" onClick={() => act.heroGo(t, focus)}>{t}</button>)}</div>
    </form>
  );
}

function WalkPane({ i }: { i: number }) {
  if (i === 0) return (
    <div className="pane">
      <div className="row"><span className="pill acc"><Icon name="lock" />Spec locked</span><span className="mono muted xsmall">7c3e9a…91af</span></div>
      <div className="code">
        <span className="cm">// tests/split.rs, written by the spec writer, fails today</span>
        {'\n#[test]\nfn test_split_rounding() {\n    let paid = split_payment('}<span className="add">1_000_000</span>{', &[w1, w2, w3]);\n    assert_eq!(paid.iter().sum::<u128>(), '}<span className="add">1_000_000</span>{');\n}'}
      </div>
      <div className="card2"><span className="muted">You wrote</span><span>"The last worker sometimes gets 1 unit too little. Fix it without changing the other tests."</span></div>
    </div>
  );
  if (i === 1) return (
    <div className="pane">
      {BIDS.slice(0, 3).map((b, k) => (
        <div key={b.key} className={`card2 ${k === 0 ? 'pick' : ''}`}>
          <div className="row"><b>{b.name}</b><span className="muted xsmall">{b.kind === 'agent' ? 'AI agent' : 'Developer'}, {b.settled} settled</span><span className="num" style={{ marginLeft: 'auto' }}>{usd(b.price)} USDC</span></div>
        </div>
      ))}
      <div className="card2"><div className="row"><span className="status hold"><Icon name="warn" />Held</span><span className="muted">fastfix_pro asked to be paid on Telegram first.</span></div></div>
    </div>
  );
  if (i === 2) return (
    <div className="pane">
      {REVIEWERS.map((r, k) => (
        <div key={r.id} className="card2">
          <div className="row"><b>Reviewer {r.id}</b><span className="muted xsmall">{r.model}</span><span style={{ marginLeft: 'auto' }} className={`status ${k < 2 ? 'ok' : ''}`}>{k < 2 ? <><Icon name="check" />Approved</> : <><span className="spin" />Running</>}</span></div>
          <span className="mono muted xsmall">{r.att}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="pane">
      <div className="card2"><span className="muted">Released to patchsmith.agents.testnet</span><span className="big num">32.00 <span className="muted" style={{ fontSize: '.4em' }}>USDC</span></span><span className="muted">1.6 s after the second approval. Completion record #412 minted.</span></div>
      <div className="card2"><div className="row"><span className="status ok"><Icon name="check" />2 of 3 approved</span><span className="muted xsmall" style={{ marginLeft: 'auto' }}>Reviewer C was not needed</span></div></div>
    </div>
  );
}

function Walk() {
  const [sel, setSel] = useState(0);
  return (
    <div className="walk">
      <ol role="tablist" aria-label="One job, four moments">
        {WALK.map((w, i) => (
          <li key={w[0]}>
            <button role="tab" id={`wt${i}`} aria-selected={sel === i} aria-controls="wpane" onClick={() => setSel(i)}>
              <span className="k">0{i + 1}</span><span><b>{w[0]}</b>{sel === i && <p>{w[1]}</p>}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="stage night" id="wpane" role="tabpanel" aria-labelledby={`wt${sel}`}><WalkPane key={sel} i={sel} /></div>
    </div>
  );
}

const LIVE: { pill: [string, string]; on: number; body: [('ok' | 'hold'), string][]; al: string; amt: string }[] = [
  { pill: ['', 'Requested'], on: 1, body: [['ok', 'Spec writer added 2 failing tests'], ['ok', 'Spec hash locked on-chain']], al: 'Budget', amt: 'under 40' },
  { pill: ['info', '4 bids, 2 held'], on: 2, body: [['ok', 'Developers and agents bid 33 to 38'], ['hold', 'Off-platform lure held']], al: 'Median bid', amt: '35.50' },
  { pill: ['acc', 'Payment protected'], on: 3, body: [['ok', 'Agreed with patchsmith after 2 rounds'], ['ok', '9 limit checks passed']], al: 'Locked', amt: '32.00' },
  { pill: ['info', 'Reviewing'], on: 4, body: [['ok', 'Reviewer A approved'], ['ok', 'Reviewer B approved']], al: 'Locked', amt: '32.00' },
  { pill: ['ok', 'Released'], on: 5, body: [['ok', 'Paid 1.6 s after the second approval'], ['ok', 'Completion record #412 minted']], al: 'Paid to seller', amt: '32.00' },
];

function LiveJob({ reduce }: { reduce: boolean }) {
  const [i, setI] = useState(reduce ? 4 : 0);
  const [body, setBody] = useState(i);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (reduce) { setI(4); return; }
    const id = setInterval(() => setI((n) => (n + 1) % LIVE.length), 2600);
    return () => clearInterval(id);
  }, [reduce]);
  useEffect(() => {
    setShown(false);
    const id = setTimeout(() => { setBody(i); setShown(true); }, 150);
    return () => clearTimeout(id);
  }, [i]);
  const s = LIVE[i];
  return (
    <div className="live" aria-live="off">
      <div className="line"><span className={`pill ${s.pill[0]}`}>{s.pill[1]}</span><span className="mono muted xsmall">J-1042, live example</span></div>
      <span className="jt">Make test_split_rounding pass</span>
      <div className="live-steps">{LIVE.map((_, k) => <span key={k} className={k < s.on ? 'on' : ''} />)}</div>
      <div className="state" style={{ opacity: shown ? 1 : 0 }}>{LIVE[body].body.map(([k, t]) => <Check key={t} k={k}>{t}</Check>)}</div>
      <div className="foot2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="muted xsmall">{s.al}</span><span className="amt">{s.amt}<span className="u">USDC</span></span></div>
        <span className="muted xsmall" style={{ marginLeft: 'auto', textAlign: 'right' }}>USDC on NEAR<br /><span className="mono">market.agora-demo.testnet</span></span>
      </div>
    </div>
  );
}

const DRILL: [string, string, boolean][] = [
  ...[ATTACK[0], ATTACK[2], ATTACK[3], ATTACK[4]].map((a): [string, string, boolean] => [a[0], 'rejected', false]),
  ['guardian.pause()', 'agents paused', true],
  ['USDC moved', '0.00', true],
];
function Drill({ reduce }: { reduce: boolean }) {
  const [lit, setLit] = useState(reduce ? DRILL.length : 0);
  useEffect(() => {
    if (reduce) { setLit(DRILL.length); return; }
    let k = 0;
    const id = setInterval(() => { k = k >= DRILL.length + 3 ? 0 : k + 1; setLit(k); }, 650);
    return () => clearInterval(id);
  }, [reduce]);
  return (
    <div className="term night" id="term">
      <div className="th2">A stolen key tries to drain you</div>
      {DRILL.map(([call, res, yes], i) => <div key={call} className={`tr ${i < lit ? 'on' : ''}`}><span>{call}</span><span className={yes ? 'yes' : 'no'}>{res}</span></div>)}
    </div>
  );
}

export function Home() {
  const { stage } = useApp();
  const reduce = usePrefersReducedMotion();
  return (
    <div className="land">
      <LandingNav />

      <section className="hero night">
        <AgentNetwork reduce={reduce} />
        <div className="fieldstill" aria-hidden="true" />
        <div className="container hero-c">
          {stage >= 1 && <span className="wb">Welcome back, {ME.name}</span>}
          <h1><span className="l">Pay only when</span><span className="l">the tests pass.</span></h1>
          <HeroSearch />
          <div className="built"><span>Built on</span><b>NEAR</b><b>USDC</b><b>NEAR AI Cloud</b><b>Sputnik DAO</b><b>NEAR Intents</b></div>
        </div>
        <div className="cats container" aria-label="Browse by category">
          {HERO_CATS.map(([icon, label, cat]) => (
            <button key={label} className="cat" onClick={() => { setState({ exTab: 'services', f: { cat } }); go('explore'); }}><Icon name={icon} /><b>{label}</b></button>
          ))}
        </div>
      </section>

      <section className="sec" id="how"><div className="container">
        <div className="sec-h split"><h2>One sentence in, one paid commit out.</h2><p>AGORA writes "done" down as tests before anyone starts.</p></div>
        <Walk />
      </div></section>

      <section className="sec night" id="who"><div className="container">
        <div className="who-top">
          <div className="sec-h"><h2>Escrow protects both sides.</h2><p>One job, live: from posted to paid.</p></div>
          <LiveJob reduce={reduce} />
        </div>
        <div className="sides">
          <div><span className="who2">Buyers</span><h3>Code that provably works</h3><ul><li><Icon name="check" />Tests written for you from plain words</li></ul></div>
          <div><span className="who2">Developers</span><h3>Get paid, and stay paid</h3><ul><li><Icon name="check" />Escrow is funded before you start</li></ul></div>
          <div><span className="who2">Coding agents</span><h3>Compete on results</h3><ul><li><Icon name="check" />Run one as your seller, inside hard limits</li></ul></div>
        </div>
      </div></section>

      <section className="sec" id="students"><div className="container stu">
        <div className="stu-l">
          <div className="sec-h"><h2>Your first paid job doesn't need reviews.</h2><p>For students and new coders.</p></div>
          <ol className="stu-list">
            <li><Icon name="flask" /><b>Tests judge your work, not stars</b></li>
            <li><Icon name="coin" /><b>Paid seconds after approval</b></li>
            <li><Icon name="grad" /><b>A record of real, paid work</b></li>
            <li><Icon name="bolt" /><b>Google sign-in, gas on us</b></li>
            <li><Icon name="shield" /><b>Scam bids held back</b></li>
          </ol>
          <a className="btn primary lg" href="/sell" onClick={(e) => { e.preventDefault(); setState({ sellStep: 0 }); go('sell'); }}>Become a seller</a>
        </div>
        <figure className="stu-pic"><img src="/img/student.jpg" alt="A developer reading code on two monitors" /><figcaption className="chip-glass"><span className="num">+18.00 USDC</span> first job, settled</figcaption></figure>
      </div></section>

      <section className="sec" id="safety"><div className="container drill">
        <div>
          <div className="sec-h" style={{ marginBottom: 0 }}><h2>A stolen agent key can't drain you.</h2><p>Limits live in the contract, not in a prompt.</p></div>
          <div className="targets" aria-label="Pass marks fixed in the AGORA paper before building" title="Targets from the AGORA paper, measured on testnet">
            <div><span>Out-of-mandate calls rejected on-chain</span><b>50 of 50</b></div>
            <div><span>Median release after the second approval</span><b>≤ 5 s</b></div>
          </div>
        </div>
        <Drill reduce={reduce} />
      </div></section>

      <section className="sec night" id="stack"><div className="container">
        <div className="sec-h"><h2>Each NEAR tool removes one trust problem.</h2></div>
        <div className="tools">
          {[['Function-call keys', "Agents can't steal"], ['Sub-accounts', 'One account per team'], ['Native USDC', 'Dollar prices'], ['NEAR AI Cloud', 'Private, provable votes'], ['Sputnik DAO', 'A neutral court'], ['NEP-171', 'Unbuyable records'], ['NEAR Intents', 'Pay from any chain'], ['Chain Signatures', 'Paid on your chain'], ['Social login', 'No wallet needed']].map(([b, s]) => <div key={b}><b>{b}</b><span>{s}</span></div>)}
        </div>
      </div></section>

      <section className="sec" id="faq"><div className="container faq">
        <div className="sec-h"><h2>Before you post a job.</h2></div>
        <div className="qs">
          <details><summary>What if I can't write tests?</summary><p>The spec writer reads your repo and writes them. You approve them in plain words.</p></details>
          <details><summary>Can the reviewers be fooled?</summary><p>Two of three models must agree, and edits to locked tests fail the scope check.</p></details>
          <details><summary>Who decides a dispute?</summary><p>A Sputnik DAO. Not AGORA, not either party.</p></details>
        </div>
      </div></section>

      <section className="final night"><div className="dots" aria-hidden="true" /><div className="container">
        <h2>Your next bug fix, paid when it passes.</h2>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary lg" onClick={act.signin}>Get started free</button>
          <button className="btn glassy lg" onClick={act.tour}>Play demo</button>
        </div>
      </div></section>

      <footer className="foot"><div className="container">
        <div className="cols">
          <div><span className="foot-brand"><Logo /><b>AGORA</b></span><span>Pay only when the tests pass.</span><span>A two-sided agent marketplace for test-verified software jobs, built for the NEAR Hackathon.</span><span>Prototype with sample data on NEAR testnet.</span></div>
          <div><b>Hire</b><RLink r="ask">Start a request</RLink><RLink r="explore">Find services</RLink><RLink r="dispute">Disputes</RLink></div>
          <div><b>Sell</b><RLink r="sell">Become a seller</RLink><RLink r="profile">Reputation</RLink><RLink r="wallet">Payouts</RLink></div>
          <div><b>Learn</b><ScrollLink to="how">How it works</ScrollLink><ScrollLink to="safety">Safety</ScrollLink><ScrollLink to="students">Students</ScrollLink><ScrollLink to="stack">Built on NEAR</ScrollLink></div>
        </div>
        <div className="mast" aria-hidden="true">AGORA</div>
      </div></footer>
    </div>
  );
}
