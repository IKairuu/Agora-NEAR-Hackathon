import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AppShell } from '../components/AppShell';
import { Icon, Mark } from '../components/icons';
import { BENEFITS, CATEGORIES, PAYOUTS, SELL_STEPS, SKILLS } from '../content/app';
import { useSession } from '../lib/auth';

type Kind = 'freelancer' | 'agent';
type Payout = (typeof PAYOUTS)[number][0];

function Tool({ name, tip }: { name: string; tip: string }) {
  return <span className="tool" title={tip}>{name}</span>;
}

function Toggle({ on, onChange, label, children }: { on: boolean; onChange: (v: boolean) => void; label: string; children: ReactNode }) {
  return (
    <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <button type="button" className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
      <div>{children}</div>
    </div>
  );
}

/**
 * Seller onboarding for both seller account types.
 * `freelancer`: a developer selling their own work. `agent`: an operator listing an AI agent.
 * Fields are local state only; publishing is not sent anywhere yet.
 */
export function SellerOnboarding({ kind }: { kind: Kind }) {
  const session = useSession();
  const agent = kind === 'agent';
  const [step, setStep] = useState(0);
  const [skills, setSkills] = useState<Record<string, boolean>>({ Rust: true, 'NEAR SDK': true, Tests: true });
  const [cats, setCats] = useState<Record<string, boolean>>({ rust: true, fe: true, tests: true, scripts: false });
  const [payout, setPayout] = useState<Payout>('near');
  const [stake, setStake] = useState(false);
  const [published, setPublished] = useState(false);

  const name = agent ? 'lumenfix' : session?.name ?? '';
  const account = agent ? `lumenfix.${session?.agents ?? 'agents.you.testnet'}` : session?.account ?? '';
  const chain = PAYOUTS.find((p) => p[0] === payout)![1];
  const go = (n: number) => { setStep(Math.max(0, Math.min(SELL_STEPS.length - 1, n))); scrollTo(0, 0); };

  const nav = (label = 'Continue', last = false) => (
    <div className="wiz-nav">
      {step > 0 ? <button className="btn" onClick={() => go(step - 1)}>Back</button> : <span />}
      <button className="btn primary" onClick={() => (last ? setPublished(true) : go(step + 1))}>{label}</button>
    </div>
  );

  const chipSet = (items: readonly (readonly [string, string])[], state: Record<string, boolean>, set: (s: Record<string, boolean>) => void) => (
    <div className="chips">
      {items.map(([k, label]) => (
        <button key={k} type="button" className={`chip ${state[k] ? 'on' : ''}`} aria-pressed={!!state[k]} onClick={() => set({ ...state, [k]: !state[k] })}>{label}</button>
      ))}
    </div>
  );

  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>{agent ? 'List your AI agent' : 'Become a seller'}</h1>
        <p className="muted">{agent ? "Put your agent to work on test-verified jobs, paid in USDC, inside limits the contract enforces." : 'Sell your work on test-verified jobs paid in USDC.'}</p>
      </div>
      <Link className="btn sm ghost" to={agent ? '/app/freelancer' : '/app/agent'}>
        <Icon name="swap" />{agent ? 'Selling your own work instead?' : 'Listing an AI agent instead?'}
      </Link>
    </div>
  );

  if (published) {
    return (
      <AppShell where={agent ? 'AI agent' : 'Freelancer'}>
        {head}
        <div className="panel">
          <div className="panel-b">
            <div className="banner ok" role="status">
              <Icon name="check" />
              <div className="grow">
                <b style={{ fontWeight: 500 }}>{agent ? `${name} is listed` : 'Seller profile published'}</b>
                <span className="muted">{agent ? 'Its bidding agent is watching jobs that match these skills and will bid inside your rules.' : 'Matching jobs will show up for you to bid on. Starter jobs from the first-job pool come first.'}</span>
              </div>
            </div>
            <p className="muted xsmall">Prototype: the profile is kept on this screen only. The seller desk is the next screen to build.</p>
            <div className="row"><button className="btn" onClick={() => { setPublished(false); go(1); }}>Edit profile</button></div>
          </div>
        </div>
      </AppShell>
    );
  }

  let body: ReactNode = null;
  if (step === 0) {
    body = (
      <>
        <div className="panel sell-hero">
          <div className="l">
            <span className="pill acc" style={{ alignSelf: 'flex-start' }}>{agent ? 'For AI agent owners' : 'For developers'}</span>
            <h2>Get paid when your tests pass.</h2>
            <p className="muted">Every job comes with tests that decide when it is done, and the money is in escrow before you start.</p>
            <div className="row"><button className="btn primary lg" onClick={() => go(1)}>Start, about 3 minutes</button></div>
          </div>
          <div className="r night">
            <div className="payslip">
              <span className="muted xsmall">Released to {agent ? 'patchsmith.agents.testnet' : 'you.testnet'}</span>
              <span className="amt num">32.00<span className="u">USDC</span></span>
              <div className="check"><Mark kind="ok" />2 of 3 reviewers approved</div>
              <div className="check"><Mark kind="ok" />Paid 1.6 s later, final</div>
              <div className="check"><Mark kind="ok" />Completion record #412</div>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>What you get</h2></div>
          <div className="panel-b" style={{ paddingTop: 0 }}>
            <div className="benefits">
              {BENEFITS.map(([icon, title, text]) => (
                <div key={title}><Icon name={icon} /><div><b>{title}</b><p>{text}</p></div></div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }
  if (step === 1) {
    body = (
      <div className="panel">
        <div className="panel-h"><h2>{agent ? 'About your agent' : 'About you'}</h2></div>
        <div className="panel-b">
          <div className="grid g-2">
            <div className="field"><label htmlFor="sl-name">{agent ? 'Agent name' : 'Display name'}</label><input className="input" id="sl-name" defaultValue={name} /></div>
            <div className="field">
              <label htmlFor="sl-acct">{agent ? 'Agent account' : 'NEAR account'}</label>
              <input className="input mono" id="sl-acct" defaultValue={account} readOnly={!agent} />
              <span className="hint">{agent ? 'A sub-account, so its key can be removed at any time.' : 'Created when you signed in with Google.'}</span>
            </div>
          </div>
          {agent && (
            <div className="grid g-2">
              <div className="field"><label htmlFor="sl-op">Operator, the person responsible</label><input className="input" id="sl-op" defaultValue={session?.name} /></div>
              <div className="field"><label htmlFor="sl-model">Model and where it runs</label><input className="input" id="sl-model" defaultValue="Runs in NEAR AI Cloud (TEE)" /></div>
            </div>
          )}
          <div className="field"><span className="lab">Skills</span>{chipSet(SKILLS.map((s) => [s, s] as const), skills, setSkills)}</div>
          <div className="grid g-2">
            <div className="field"><label htmlFor="sl-gh">GitHub</label><input className="input" id="sl-gh" placeholder="github.com/you" /><span className="hint">Used to show public work. Reputation still comes only from settled jobs.</span></div>
            <div className="field"><label htmlFor="sl-bio">One line about {agent ? 'what it does' : 'your work'}</label><input className="input" id="sl-bio" defaultValue="Rust contract fixes with a test for every bug." /></div>
          </div>
          {nav()}
        </div>
      </div>
    );
  }
  if (step === 2) {
    body = (
      <div className="panel">
        <div className="panel-h"><h2>Pricing and delivery</h2><div className="r"><Tool name="Meta-transactions" tip="Relayer pays gas for bids and deliveries" /></div></div>
        <div className="panel-b">
          <div className="grid g-2">
            <div className="field"><label htmlFor="sl-floor">Price floor</label><input className="input num" id="sl-floor" defaultValue="12.00 USDC" /><span className="hint">{agent ? 'Your bidding agent never bids below this.' : 'Jobs below this are hidden from you.'}</span></div>
            <div className="field"><label htmlFor="sl-max">Jobs at once</label><input className="input num" id="sl-max" defaultValue="3" inputMode="numeric" /></div>
          </div>
          <div className="field"><label htmlFor="sl-terms">Delivery terms</label><input className="input" id="sl-terms" defaultValue="1 to 2 days, includes one extra edge-case test" /></div>
          <div className="field"><span className="lab">Categories you take</span>{chipSet(CATEGORIES, cats, setCats)}</div>
          {agent && (
            <div className="banner info">
              <Icon name="bot" />
              <div className="grow"><b style={{ fontWeight: 500 }}>Your bidding agent</b><span className="muted">It watches matching jobs and bids inside these rules. Its key can call place_bid and submit_delivery only.</span></div>
            </div>
          )}
          {nav()}
        </div>
      </div>
    );
  }
  if (step === 3) {
    body = (
      <div className="panel">
        <div className="panel-h"><h2>Get paid</h2><div className="r"><Tool name="Chain Signatures" tip="Your NEAR account signs a payout on another chain" /></div></div>
        <div className="panel-b">
          <div className="field">
            <span className="lab" id="payout-l">Payout</span>
            <div className="seg" role="group" aria-labelledby="payout-l">
              {PAYOUTS.map(([k, label]) => <button key={k} type="button" className={payout === k ? 'on' : ''} aria-pressed={payout === k} onClick={() => setPayout(k)}>{label}</button>)}
            </div>
          </div>
          {payout === 'near'
            ? <p className="muted">Released milestones land in <span className="mono">{account}</span>. Only your full-access key can withdraw.</p>
            : (
              <div className="field">
                <label htmlFor="sl-addr">Payout address</label>
                <input className="input mono" id="sl-addr" placeholder="0x…" />
                <span className="hint">Your NEAR account signs the transfer on {payout === 'eth' ? 'Ethereum' : 'Base'}. No bridge, no second wallet.</span>
              </div>
            )}
          <Toggle on={stake} onChange={setStake} label="Optional starter stake">
            <b style={{ fontWeight: 500 }}>Optional starter stake, 10.00 USDC</b>
            <div className="muted xsmall">Raises your starter cap from 25 to 60 USDC before your 3rd settled job. Returned after clean jobs.</div>
          </Toggle>
          {nav('Review')}
        </div>
      </div>
    );
  }
  if (step === 4) {
    const picked = Object.keys(skills).filter((k) => skills[k]);
    body = (
      <div className="panel">
        <div className="panel-h"><h2>Review and publish</h2></div>
        <div className="panel-b">
          <dl className="kv">
            <dt>Seller type</dt><dd>{agent ? `AI agent, operated by ${session?.name}` : 'Developer'}</dd>
            <dt>Name</dt><dd>{name}</dd>
            <dt>Account</dt><dd className="mono">{account}</dd>
            <dt>Skills</dt><dd>{picked.join(', ') || 'None picked'}</dd>
            <dt>Price floor</dt><dd className="num">12.00 USDC</dd>
            <dt>Payout</dt><dd>{chain}</dd>
            <dt>Starter cap</dt><dd className="num">{stake ? '60.00 USDC, staked' : '25.00 USDC'}</dd>
          </dl>
          <div className="banner ok">
            <Icon name="gift" />
            <div className="grow"><b style={{ fontWeight: 500 }}>Eligible for the first-job pool</b><span className="muted">Starter jobs are reserved for sellers with fewer than 3 settled jobs.</span></div>
          </div>
          {nav(agent ? 'List my agent' : 'Publish seller profile', true)}
        </div>
      </div>
    );
  }

  return (
    <AppShell where={agent ? 'AI agent' : 'Freelancer'}>
      {head}
      <div className="steps-h" aria-label={`Step ${step + 1} of ${SELL_STEPS.length}`}>
        {SELL_STEPS.map((s, i) => <div key={s} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>{s}</div>)}
      </div>
      {body}
    </AppShell>
  );
}
