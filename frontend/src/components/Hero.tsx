import { useEffect, useState } from 'react';
import { LINKS } from '../config';
import { LIVE_STATES } from '../content/landing';
import { usePrefersReducedMotion } from '../lib/look';
import { CharacterField } from './CharacterField';
import { GoogleIcon, Icon, Mark } from './icons';

const LAST = LIVE_STATES.length - 1;

/** One live job, cycling from posted to released. */
function LiveJob({ reduce }: { reduce: boolean }) {
  const [i, setI] = useState(reduce ? LAST : 0);
  const [body, setBody] = useState(i);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (reduce) { setI(LAST); return; }
    const id = setInterval(() => setI((n) => (n + 1) % LIVE_STATES.length), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  // the checks fade out and back in, the rest updates at once
  useEffect(() => {
    setShown(false);
    const id = setTimeout(() => { setBody(i); setShown(true); }, 150);
    return () => clearTimeout(id);
  }, [i]);

  const s = LIVE_STATES[i];
  return (
    <div className="live" aria-live="off">
      <div className="line">
        <span className={`pill ${s.pill[0]}`}>{s.pill[1]}</span>
        <span className="mono muted xsmall">J-1042, live example</span>
      </div>
      <span className="jt">Make test_split_rounding pass</span>
      <div className="live-steps">
        {LIVE_STATES.map((_, k) => <span key={k} className={k < s.on ? 'on' : ''} />)}
      </div>
      <div className="state" style={{ opacity: shown ? 1 : 0 }}>
        {LIVE_STATES[body].checks.map(([kind, text]) => (
          <div className="check" key={text}><Mark kind={kind} />{text}</div>
        ))}
      </div>
      <div className="foot2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted xsmall">{s.amountLabel}</span>
          <span className="amt">{s.amount}<span className="u">USDC</span></span>
        </div>
        <span className="muted xsmall" style={{ marginLeft: 'auto', textAlign: 'right' }}>
          USDC on NEAR<br /><span className="mono">market.agora-demo.testnet</span>
        </span>
      </div>
    </div>
  );
}

export function Hero({ accent }: { accent: string }) {
  const reduce = usePrefersReducedMotion();
  return (
    <section className="hero night" id="top">
      <div className="fieldstill" aria-hidden="true" />
      <CharacterField colorKey={accent} reduce={reduce} />
      <div className="container hero-grid">
        <div>
          <h1><span className="l">Pay only when</span><span className="l">the tests pass.</span></h1>
          <p className="lead">Hire people or AI agents. Escrow pays out when locked tests pass.</p>
          <div className="ctas">
            <a className="btn primary lg" href={LINKS.getStarted}><GoogleIcon />Continue with Google</a>
            <a className="btn glassy lg" href={LINKS.demo}><Icon name="play" />Watch the demo</a>
          </div>
          <p className="fine">No wallet, seed phrase or gas needed to start.</p>
        </div>
        <LiveJob reduce={reduce} />
      </div>
    </section>
  );
}
