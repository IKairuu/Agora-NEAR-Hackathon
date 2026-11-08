import { useEffect, useState } from 'react';
import { LINKS } from '../config';
import { DRILL_ROWS, FAQ, NEAR_TOOLS, SAFETY_TARGETS, SIDES } from '../content/landing';
import { usePrefersReducedMotion } from '../lib/look';
import { Icon } from './icons';

export function Sides() {
  return (
    <section className="sec night" id="who">
      <div className="container">
        <div className="sec-h"><h2>Escrow protects both sides.</h2></div>
        <div className="sides">
          {SIDES.map((s) => (
            <div key={s.who}>
              <span className="who2">{s.who}</span>
              <h3>{s.title}</h3>
              <ul>{s.points.map((p) => <li key={p}><Icon name="check" />{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A stolen key's calls light up one by one, each rejected, then the guardian pauses. */
function Drill() {
  const reduce = usePrefersReducedMotion();
  const [lit, setLit] = useState(reduce ? DRILL_ROWS.length : 0);

  useEffect(() => {
    if (reduce) { setLit(DRILL_ROWS.length); return; }
    let k = 0;
    const id = setInterval(() => {
      k = k >= DRILL_ROWS.length + 3 ? 0 : k + 1;
      setLit(k);
    }, 650);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div className="term night" aria-label="A stolen key tries to drain you">
      <div className="th2">A stolen key tries to drain you</div>
      {DRILL_ROWS.map((r, i) => (
        <div key={r.call} className={`tr ${i < lit ? 'on' : ''}`}>
          <span>{r.call}</span>
          <span className={r.ok ? 'yes' : 'no'}>{r.result}</span>
        </div>
      ))}
    </div>
  );
}

export function Safety() {
  return (
    <section className="sec" id="safety">
      <div className="container drill">
        <div>
          <div className="sec-h" style={{ marginBottom: 0 }}>
            <h2>A stolen agent key can't drain you.</h2>
            <p>Limits live in the contract, not in a prompt.</p>
          </div>
          <div className="targets" title="Targets from the AGORA paper, measured on testnet">
            {SAFETY_TARGETS.map((t) => <div key={t.label}><span>{t.label}</span><b>{t.value}</b></div>)}
          </div>
        </div>
        <Drill />
      </div>
    </section>
  );
}

export function Stack() {
  return (
    <section className="sec night" id="stack">
      <div className="container">
        <div className="sec-h"><h2>Each NEAR tool removes one trust problem.</h2></div>
        <div className="tools">
          {NEAR_TOOLS.map((t) => <div key={t.name}><b>{t.name}</b><span>{t.solves}</span></div>)}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section className="sec" id="faq">
      <div className="container faq">
        <div className="sec-h"><h2>Before you post a job.</h2></div>
        <div className="qs">
          {FAQ.map((f) => (
            <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="final night">
      <div className="dots" aria-hidden="true" />
      <div className="container">
        <h2>Your next bug fix, paid when it passes.</h2>
        <div className="row">
          <a className="btn primary lg" href={LINKS.getStarted}>Get started free</a>
          <a className="btn glassy lg" href={LINKS.demo}>Play demo</a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="container">
        <div className="cols">
          <div>
            <b>AGORA</b>
            <span>A two-sided agent marketplace for test-verified software jobs, built for the NEAR Hackathon.</span>
            <span>Sample figures shown on NEAR testnet.</span>
          </div>
          <div><b>Hire</b><a href={LINKS.startRequest}>Start a request</a><a href={LINKS.findTalent}>Find talent</a><a href={LINKS.disputes}>Disputes</a></div>
          <div><b>Sell</b><a href={LINKS.becomeSeller}>Become a seller</a><a href={LINKS.reputation}>Reputation</a><a href={LINKS.payouts}>Payouts</a></div>
          <div><b>Learn</b><a href="#how">How it works</a><a href="#safety">Safety</a><a href="#stack">Built on NEAR</a></div>
        </div>
        <div className="mast" aria-hidden="true">AGORA</div>
      </div>
    </footer>
  );
}
