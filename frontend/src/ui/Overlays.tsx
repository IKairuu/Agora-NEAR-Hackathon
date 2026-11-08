import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { gigBy, ME, OTHER_JOBS, ROLES, sellerBy, usd, VIA, BIDS } from '../data/sample';
import { act, orderAct, TOUR } from '../store/actions';
import { closeModal, free, setState, useApp, useToasts } from '../store/store';
import { GoogleIcon, Icon, Tile } from './icons';
import { Check, T } from './parts';

/* ---------------- modals ---------------- */
function Frame({ cls = '', children }: { cls?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button:not([data-close]), input, textarea')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div ref={box} className={`modal ${cls}`.trim()} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}
const Cancel = ({ label = 'Cancel' }: { label?: string }) => <button className="btn" data-close="1" onClick={closeModal}>{label}</button>;

function SignIn() {
  const [mail, setMail] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); act.signMail(mail.trim()); };
  return (
    <Frame cls="auth-m">
      <div className="auth">
        <Tile size="lg" />
        <h2>Sign in or create an account</h2>
        <p className="muted">Use an account you already have. AGORA sets up a NEAR account for you, with no seed phrase and no gas.</p>
        <button className="btn wide" onClick={() => act.signVia('google')}><GoogleIcon />Continue with Google</button>
        <button className="btn wide" onClick={() => act.signVia('github')}><Icon name="github" />Continue with GitHub</button>
        <div className="or"><span>or</span></div>
        <form className="mailrow" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="mail-in">Email</label>
          <input className="input" id="mail-in" type="email" placeholder="you@example.com" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} />
          <button className="btn" type="submit">Continue</button>
        </form>
        <div className="or"><span>Already use NEAR?</span></div>
        <button className="btn wide ghost-line" onClick={() => setState({ modal: { kind: 'wallets' } })}><Icon name="wallet" />Connect a NEAR wallet</button>
        <p className="muted xsmall">Prototype on testnet: sign-in is simulated. By continuing you agree to the terms.</p>
      </div>
    </Frame>
  );
}

function Wallets() {
  const list = [['Meteor Wallet', 'Browser extension and web'], ['HOT Wallet', 'Mobile and Telegram'], ['MyNearWallet', 'Web wallet'], ['Ledger', 'Hardware wallet']];
  return (
    <Frame>
      <h2>Connect a NEAR wallet</h2>
      <p className="muted">Your wallet keeps its own keys. AGORA never sees your seed phrase.</p>
      <div className="wallets">
        {list.map((w) => (
          <button key={w[0]} className="wl" onClick={() => act.signVia('wallet')}>
            <span className="avatar ag">{w[0].slice(0, 1)}</span><span><b>{w[0]}</b><span className="muted xsmall">{w[1]}</span></span><Icon name="ext" />
          </button>
        ))}
      </div>
      <div className="acts"><button className="btn" onClick={act.signin}>Back</button></div>
    </Frame>
  );
}

function RolePicker() {
  const { rolePick: p, signVia } = useApp();
  return (
    <Frame cls="wide">
      <div className="row"><Tile size="sm" /><span className="muted small">{signVia === 'wallet' ? 'Wallet connected' : `Signed in with ${VIA[signVia || 'google']}. Your NEAR account is ready.`}</span></div>
      <h2>{ME.acct}, what brings you to AGORA?</h2>
      <p className="muted">We'll set up your home around it. You can change this any time from your profile menu.</p>
      <div className="picker two" role="radiogroup" aria-label="What brings you here">
        {ROLES.map(([id, icon, title, d]) => (
          <button key={id} className="pick" role="radio" aria-checked={p === id} onClick={() => setState({ rolePick: id })}>
            <span className="box">{p === id && <Icon name="check" />}</span><span className="gl"><Icon name={icon} /></span><b>{title}</b><span className="d">{d}</span>
          </button>
        ))}
      </div>
      <div className="acts"><button className="btn ghost" onClick={act.roleskip}>Skip for now</button><button className="btn primary" onClick={act.rolego} disabled={!p}>Next</button></div>
    </Frame>
  );
}

function Fund() {
  const s = useApp();
  const b = sellerBy(s.chatWith) || BIDS[0];
  const checks = ['Not paused', `${usd(b.final)} within per-job cap 50.00`, `Today 0.00 plus ${usd(b.final)} within daily cap 120.00`, 'Category: smart contracts', `No fraud flag on ${b.name} (${b.fraud}/100)`, 'Price check cleared', 'Free balance 120.00'];
  return (
    <Frame>
      <h2>Fund escrow</h2>
      <p className="muted">Your transaction agent will call <span className="mono">fund_job</span> for {b.name}. The contract checks your limits first.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{checks.map((c) => <Check key={c}>{c}</Check>)}</div>
      <div className="acts"><Cancel /><button className="btn primary" onClick={act.fund2}>Lock {usd(b.final)} USDC</button></div>
    </Frame>
  );
}

function Send() {
  const s = useApp();
  return (
    <Frame>
      <h2>Send USDC</h2>
      <div className="field"><label htmlFor="snd-to">To</label><input className="input mono" id="snd-to" placeholder="name.near or name.testnet" /></div>
      <div className="field"><label htmlFor="snd-amt">Amount</label><input className="input num" id="snd-amt" defaultValue="10.00" /><span className="hint">{usd(free(s))} USDC available</span></div>
      <div className="banner hold"><Icon name="lock" /><div className="grow"><span>Sending needs your full-access key. Agent keys can't send.</span></div></div>
      <div className="acts"><Cancel /><button className="btn primary" onClick={act.send2}>Confirm with Google</button></div>
    </Frame>
  );
}

function Receive() {
  return (
    <Frame>
      <h2>Receive</h2>
      <p className="muted">Send USDC on NEAR to this account. To pay in from another chain, use Add funds.</p>
      <div className="panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}><span className="avatar lg"><Icon name="qr" /></span><span className="mono">{ME.acct}</span></div>
      <div className="acts"><button className="btn" onClick={act.copyacct}><Icon name="copy" />Copy account</button><button className="btn primary" onClick={closeModal}>Done</button></div>
    </Frame>
  );
}

function AddFunds() {
  return (
    <Frame>
      <div className="row"><h2>Add funds</h2><T name="NEAR Intents" tip="Cross-chain pay-in settled as USDC on NEAR" /></div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="w-from">From</label><select className="input" id="w-from">{['USDC on Base', 'USDC on Arbitrum', 'ETH on Ethereum', 'SOL on Solana', 'USDC on NEAR'].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div className="field"><label htmlFor="w-amt">Amount</label><input className="input num" id="w-amt" defaultValue="100.00" /></div>
      </div>
      <div className="banner info"><Icon name="bolt" /><div className="grow"><b style={{ fontWeight: 500 }}>You receive 99.71 USDC on NEAR</b><span className="muted">About 40 seconds, fee 0.29, quote expires in 2 min</span></div></div>
      <p className="muted xsmall">Intents has no testnet, so this prototype shows dry-run quotes only.</p>
      <div className="acts"><Cancel /><button className="btn primary" onClick={act.intents}>Get dry-run quote</button></div>
    </Frame>
  );
}

function Dispute() {
  return (
    <Frame>
      <h2>Open a dispute?</h2>
      <p className="muted">This freezes the 32.00 USDC milestone and sends the spec, commits and reviewer logs to the arbiter DAO. Auto-release stops until the DAO rules.</p>
      <div className="field"><label htmlFor="d-why">What went wrong</label><textarea className="input" id="d-why" placeholder="Explain in a sentence or two" /></div>
      <div className="acts"><Cancel /><button className="btn danger" onClick={act.dispute2}>Freeze and send to DAO</button></div>
    </Frame>
  );
}

function Unpause() {
  return (
    <Frame>
      <h2>Unpause agents</h2>
      <p className="muted">The guardian paused your agents after 6 rejected calls. Rotate the transaction key before unpausing.</p>
      <Check>Delete old key ed25519:7Hk…2mL</Check>
      <Check>Add new function-call key (same 6 methods)</Check>
      <div className="acts"><Cancel /><button className="btn primary" onClick={act.unpause2}>Confirm with Google and unpause</button></div>
    </Frame>
  );
}

function RequestService() {
  const { svc } = useApp();
  const g = gigBy(svc)!;
  const [what, setWhat] = useState(g.prompt);
  return (
    <Frame>
      <h2>Request this service</h2>
      <p className="muted">{g.seller} gets this first. Your agent writes the tests from it, and escrow funds only if they accept.</p>
      <div className="field"><label htmlFor="rq-repo">Repository</label><input className="input" id="rq-repo" defaultValue="github.com/lumen-labs/payroll-vault" /></div>
      <div className="field"><label htmlFor="rq-what">What's broken or needed</label><textarea className="input" id="rq-what" value={what} onChange={(e) => setWhat(e.target.value)} /></div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="rq-b">Budget</label><input className="input num" id="rq-b" defaultValue={`${g.from}.00 USDC`} /></div>
        <div className="field"><label htmlFor="rq-d">Deliver within</label><select className="input" id="rq-d"><option>{g.days === 1 ? '1 day' : g.days + ' days'}</option><option>1 week</option></select></div>
      </div>
      <div className="acts"><Cancel /><button className="btn primary" onClick={() => act.reqsvc2(what.trim())}>Send request</button></div>
    </Frame>
  );
}

function OtherJob({ id }: { id: string }) {
  const { newJobs } = useApp();
  const j = [...newJobs, ...OTHER_JOBS].find((x) => x.id === id);
  if (!j) return null;
  return (
    <Frame>
      <div className="row"><span className={`pill ${j.status[0]}`}>{j.status[1]}</span><span className="mono muted xsmall">{j.id}</span></div>
      <h2>{j.title}</h2>
      <dl className="kv">
        <dt>Category</dt><dd>{j.cat}</dd><dt>Budget</dt><dd>{j.budget} USDC</dd>
        {j.who && <><dt>Seller</dt><dd>{j.who}</dd></>}
        <dt>Status</dt><dd>{j.note}</dd>
      </dl>
      <p className="muted xsmall">Sample job. The full walkthrough runs on J-1042.</p>
      <div className="acts"><button className="btn primary" onClick={closeModal}>Close</button></div>
    </Frame>
  );
}

function Offer({ id }: { id: string }) {
  const { orders } = useApp();
  const o = orders.find((x) => x.id === id);
  const [price, setPrice] = useState('42.00 USDC');
  const [days, setDays] = useState('2 days');
  if (!o) return null;
  return (
    <Frame>
      <h2>Send an offer</h2>
      <p className="muted">{o.buyer} asked: {o.title}. If they accept, the tests are locked and escrow is funded before you start.</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); orderAct.sendOffer(id, price, days); }}>
        <div className="grid g-2">
          <div className="field"><label htmlFor="of-p">Your price</label><input className="input num" id="of-p" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="field"><label htmlFor="of-d">Delivery</label><select className="input" id="of-d" value={days} onChange={(e) => setDays(e.target.value)}><option>1 day</option><option>2 days</option><option>3 days</option></select></div>
        </div>
        <div className="field"><label htmlFor="of-n">Note to the buyer</label><textarea className="input" id="of-n" rows={3} defaultValue="I can reproduce it on Safari 18. I will add one extra test for the 390 px layout." /></div>
        <div className="acts"><button type="button" className="btn ghost" data-close="1" onClick={closeModal}>Cancel</button><button type="submit" className="btn primary">Send offer</button></div>
      </form>
    </Frame>
  );
}

export function ModalHost() {
  const { modal } = useApp();
  if (!modal) return null;
  switch (modal.kind) {
    case 'signin': return <SignIn />;
    case 'wallets': return <Wallets />;
    case 'role': return <RolePicker />;
    case 'fund': return <Fund />;
    case 'send': return <Send />;
    case 'receive': return <Receive />;
    case 'addfunds': return <AddFunds />;
    case 'dispute': return <Dispute />;
    case 'unpause': return <Unpause />;
    case 'reqsvc': return <RequestService />;
    case 'ojob': return <OtherJob id={modal.props?.id ?? ''} />;
    case 'offer': return <Offer id={modal.props?.id ?? ''} />;
  }
}

/* ---------------- toasts ---------------- */
export function Toasts() {
  const list = useToasts();
  return (
    <div id="toasts">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status">
          <Icon name={t.kind === 'block' ? 'x' : t.kind === 'hold' ? 'warn' : 'check'} /><div>{t.msg}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- demo tour ---------------- */
export function Tour() {
  const { tour, tourMin } = useApp();
  if (tour < 0) return null;
  if (tourMin) return <button className="btn primary tour-min" onClick={() => setState({ tourMin: false })}><Icon name="play" />Demo, step {tour + 1} of {TOUR.length}</button>;
  const s = TOUR[tour];
  return (
    <div className="tour" role="dialog" aria-label="Demo walkthrough">
      <div className="tour-prog">{TOUR.map((_, i) => <i key={i} className={i <= tour ? 'on' : ''} />)}</div>
      <div className="row">
        <span className="meta2">Demo, step {tour + 1} of {TOUR.length}</span>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setState({ tourMin: true })}>Hide</button>
        <button className="btn ghost sm" onClick={act.tourend}>Exit</button>
      </div>
      <h3>{s.t}</h3><p>{s.p}</p>{s.d && <div className="do">{s.d}</div>}
      <div className="row">
        <button className="btn glassy" onClick={act.tourback} disabled={tour === 0}>Back</button>
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={act.tournext}>{tour === TOUR.length - 1 ? 'Finish' : 'Next'}</button>
      </div>
    </div>
  );
}
