import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DONE_JOBS, gigBy, ME, OTHER_JOBS, ROLES, usd, VIA } from '../data/data';
import { act, go, orderAct, TOUR } from '../store/actions';
import { liveLinkWallet, liveRemoveJob, liveWalletMove, liveWalletSendUsdc, loadWalletBalances } from '../lib/live';
import { connectedAccount, disconnectWallet, NEAR_NETWORK, pickWallet, proveOwnership, proveSignIn } from '../lib/near';
import { closeModal, free, hPrice, setState, toast, useApp, useToasts } from '../store/store';
import { authConfigured } from '../lib/supabase';
import { GoogleIcon, Icon, Tile } from './icons';
import { Check, T } from './parts';

const WALLETS = [['Meteor Wallet', 'Browser extension and web'], ['HOT Wallet', 'Mobile and Telegram'], ['MyNearWallet', 'Web wallet'], ['Ledger', 'Hardware wallet']];

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
  const [busy, setBusy] = useState<'' | 'google' | 'github'>('');
  /* Real sign-in leaves the page for the provider; if it fails to start, the button comes back. */
  const oauth = (via: 'google' | 'github') => {
    if (!authConfigured) { act.signVia(via); return; }
    setBusy(via);
    void act.oauth(via).finally(() => setBusy(''));
  };
  return (
    <Frame cls="auth-m">
      <div className="auth">
        <Tile size="lg" />
        <h2>Sign in</h2>
        <p className="muted">New here? Signing in creates your account. AGORA makes a NEAR account for you: no password, no seed phrase, no gas.</p>
        <button className="btn wide" disabled={!!busy} aria-busy={busy === 'google'} onClick={() => oauth('google')}><GoogleIcon />{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button>
        <button className="btn wide" disabled={!!busy} aria-busy={busy === 'github'} onClick={() => oauth('github')}><Icon name="github" />{busy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}</button>
        <button className="btn wide" onClick={act.passkey}><Icon name="lock" />Continue with a passkey</button>
        <div className="or"><span>or</span></div>
        <form className="mailrow" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="mail-in">Email</label>
          <input className="input" id="mail-in" type="email" placeholder="you@example.com" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} />
          <button className="btn" type="submit">Continue</button>
        </form>
        <div className="or"><span>Already use NEAR?</span></div>
        <button className="btn wide ghost-line" onClick={() => setState({ modal: { kind: 'wallets' } })}><Icon name="wallet" />Connect a NEAR wallet</button>
        <p className="muted xsmall">{authConfigured ? "Google and GitHub open their own sign-in page. AGORA never sees your password." : "Prototype on testnet: sign-in is simulated."} By continuing you agree to the terms.</p>
      </div>
    </Frame>
  );
}

/** The 6-digit email code. Prototype: any 6 digits work. */
function Code() {
  const { mail } = useApp();
  const [code, setCode] = useState('');
  return (
    <Frame cls="auth-m">
      <div className="auth">
        <Tile size="lg" />
        <h2>Check your email</h2>
        <p className="muted">We sent a 6-digit code to <b>{mail || 'your inbox'}</b>. It expires in 10 minutes.</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); act.signCode(code); }}>
          <label className="visually-hidden" htmlFor="code-in">6-digit code</label>
          <input className="input otp num" id="code-in" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn primary wide" type="submit">Verify and continue</button>
        </form>
        <div className="row" style={{ justifyContent: 'center' }}><button className="lk" onClick={act.passkey}>Use a passkey instead</button><button className="lk" onClick={act.resend}>Resend code</button></div>
        <p className="muted xsmall">AGORA never asks for a password. A one-time code or a passkey can't be reused or leaked. Prototype: any 6 digits work.</p>
      </div>
    </Frame>
  );
}

/** After sign-in: the NEAR account is ready; connecting a wallet is optional. */
function WalletStep() {
  return (
    <Frame cls="auth-m">
      <div className="auth">
        <Tile size="lg" />
        <h2>Your NEAR account is ready</h2>
        <p className="muted">We created <b className="mono">{ME.acct}</b> and a sub-account for your agents. Gas is on us.</p>
        <div className="banner"><Icon name="wallet" /><div className="grow"><b style={{ fontWeight: 500 }}>Already have a NEAR wallet?</b><span className="muted small">Connect it to fund jobs from it. Optional: you can add USDC from another chain later. Sellers add a payout wallet only when they withdraw.</span></div></div>
        <button className="btn wide ghost-line" onClick={act.walletpick}><Icon name="wallet" />Connect a NEAR wallet</button>
        <button className="btn primary wide" onClick={act.signin2}>Skip for now</button>
      </div>
    </Frame>
  );
}

function Wallets({ onPick, back }: { onPick: () => void; back: () => void }) {
  return (
    <Frame>
      <h2>Connect a NEAR wallet</h2>
      <p className="muted">Your wallet keeps its own keys. AGORA never sees your seed phrase.</p>
      <div className="wallets">
        {WALLETS.map((w) => (
          <button key={w[0]} className="wl" onClick={onPick}>
            <span className="avatar ag">{w[0].slice(0, 1)}</span><span><b>{w[0]}</b><span className="muted xsmall">{w[1]}</span></span><Icon name="ext" />
          </button>
        ))}
      </div>
      <div className="acts"><button className="btn" onClick={back}>Back</button></div>
    </Frame>
  );
}

/**
 * Links the user's real NEAR wallet (signed-in accounts only). Two clicks on purpose: one to connect a wallet,
 * one to sign the ownership message, because wallets open popups that browsers only allow straight after a click.
 */
function LinkWallet({ onDone, back, signIn = false }: { onDone: () => void; back: () => void; signIn?: boolean }) {
  const { user } = useApp();
  const [acct, setAcct] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'load' | 'pick' | 'sign'>('load');
  const [err, setErr] = useState('');
  useEffect(() => {
    let on = true;
    connectedAccount().then((a) => { if (on) setAcct(a); }, () => { if (on) setErr('Could not load the wallet list. Check your connection and try again.'); }).finally(() => { if (on) setBusy(''); });
    return () => { on = false; };
  }, []);
  const pick = async () => {
    setErr(''); setBusy('pick');
    try { setAcct(await pickWallet()); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the wallet'); }
    setBusy('');
  };
  const other = async () => { await disconnectWallet().catch(() => undefined); setAcct(null); await pick(); };
  const link = async () => {
    if (!signIn && !user) return;
    setErr(''); setBusy('sign');
    try {
      if (signIn) {
        const fail = await act.walletSignIn(await proveSignIn());
        if (!fail) { onDone(); return; }
        setErr(fail);
      } else if (await liveLinkWallet(await proveOwnership(user!.id))) { onDone(); return; }
    } catch (e) { setErr(e instanceof Error ? e.message : 'The wallet did not sign'); }
    setBusy('');
  };
  return (
    <Frame>
      <h2>{signIn ? 'Sign in with a NEAR wallet' : 'Connect a NEAR wallet'}</h2>
      <p className="muted">Your wallet keeps its own keys. AGORA never sees your seed phrase. Use a {NEAR_NETWORK} account.{signIn ? ' If this wallet is linked to an AGORA account you open that account; otherwise a new one is made for it.' : ''}</p>
      {acct ? (
        <>
          <div className="banner"><Icon name="wallet" /><div className="grow"><b className="mono" style={{ fontWeight: 500 }}>{acct}</b><span className="muted small">Sign a short message to prove this account is yours. It is not a transaction and costs nothing.</span></div></div>
          <button className="btn primary wide" disabled={!!busy} aria-busy={busy === 'sign'} onClick={() => void link()}>{busy === 'sign' ? 'Waiting for your wallet…' : signIn ? 'Sign and sign in' : 'Sign and link'}</button>
          <button className="lk" disabled={!!busy} onClick={() => void other()}>Use another wallet</button>
        </>
      ) : (
        <button className="btn primary wide" disabled={!!busy} aria-busy={busy === 'pick'} onClick={() => void pick()}><Icon name="wallet" />{busy === 'load' ? 'Loading wallets…' : busy === 'pick' ? 'Waiting for your wallet…' : 'Choose a wallet'}</button>
      )}
      {err && <p className="small" role="alert" style={{ color: 'var(--block, #c0392b)' }}>{err}</p>}
      <div className="acts"><button className="btn" onClick={back}>Back</button></div>
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

/** The number typed in an amount box, or 0. */
const amountIn = (v: string): number => { const n = Number(v.replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/** "In your wallet" line, read from the chain. Shows nothing until the read comes back. */
function WalletLine() {
  const { walletBal } = useApp();
  useEffect(() => { void loadWalletBalances(); }, []);
  if (!walletBal) return null;
  return <span className="hint">In your NEAR wallet: {walletBal.usdc === null ? 'USDC token not set' : `${usd(walletBal.usdc)} USDC`}, {walletBal.near.toFixed(2)} NEAR for gas</span>;
}

/** Real chain mode: Add funds (ft_transfer_call from the wallet) or Withdraw (contract back to the wallet), signed in the wallet. */
function WalletMove({ op }: { op: 'deposit' | 'withdraw' }) {
  const s = useApp();
  const [amt, setAmt] = useState('10.00');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const n = amountIn(amt);
    if (!n) { toast('Enter an amount above 0.', 'hold'); return; }
    if (op === 'withdraw' && n > free(s)) { toast(`You have ${usd(free(s))} USDC free to withdraw.`, 'hold'); return; }
    setBusy(true);
    if (await liveWalletMove(op, n)) closeModal(); else setBusy(false);
  };
  return (
    <Frame>
      <h2>{op === 'deposit' ? 'Add funds from your wallet' : 'Withdraw to your wallet'}</h2>
      <p className="muted">{op === 'deposit' ? 'Moves USDC from your NEAR wallet into your AGORA balance with ft_transfer_call. Your agents can spend it only inside your limits.' : 'Sends free USDC from your AGORA balance back to your NEAR wallet. Money locked in Protected payment stays put.'}</p>
      <div className="field"><label htmlFor="wm-amt">Amount (USDC)</label><input className="input num" id="wm-amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
        {op === 'deposit' ? <WalletLine /> : <span className="hint">{usd(free(s))} USDC free in AGORA</span>}</div>
      <div className="banner hold"><Icon name="lock" /><div className="grow"><span>Your wallet opens to confirm. It needs your full-access key, so agent keys can never do this.</span></div></div>
      <div className="acts"><Cancel /><button className="btn primary" disabled={busy} aria-busy={busy} onClick={() => void go()}>{busy ? 'Waiting for your wallet…' : 'Confirm in your wallet'}</button></div>
    </Frame>
  );
}

/** Live: a plain USDC transfer from the user's own NEAR wallet. */
function LiveSend() {
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('10.00');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const n = amountIn(amt);
    if (!/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(to.trim())) { toast('Enter a NEAR account, like name.testnet.', 'hold'); return; }
    if (!n) { toast('Enter an amount above 0.', 'hold'); return; }
    setBusy(true);
    if (await liveWalletSendUsdc(to.trim(), n)) closeModal(); else setBusy(false);
  };
  return (
    <Frame>
      <h2>Send USDC</h2>
      <div className="field"><label htmlFor="snd-to">To</label><input className="input mono" id="snd-to" placeholder="name.testnet" value={to} onChange={(e) => setTo(e.target.value.toLowerCase())} /></div>
      <div className="field"><label htmlFor="snd-amt">Amount</label><input className="input num" id="snd-amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /><WalletLine /></div>
      <div className="banner hold"><Icon name="lock" /><div className="grow"><span>Sends from your NEAR wallet, not from your AGORA balance. Your wallet opens to confirm; agent keys can't send.</span></div></div>
      <div className="acts"><Cancel /><button className="btn primary" disabled={busy} aria-busy={busy} onClick={() => void go()}>{busy ? 'Waiting for your wallet…' : 'Confirm in your wallet'}</button></div>
    </Frame>
  );
}

function Send() {
  const s = useApp();
  if (s.live) return <LiveSend />;
  return (
    <Frame>
      <h2>Send USDC</h2>
      <div className="field"><label htmlFor="snd-to">To</label><input className="input mono" id="snd-to" placeholder="name.near or name.testnet" /></div>
      <div className="field"><label htmlFor="snd-amt">Amount</label><input className="input num" id="snd-amt" placeholder="0.00" defaultValue="10.00" /><span className="hint">{usd(free(s))} USDC available</span></div>
      <div className="banner hold"><Icon name="lock" /><div className="grow"><span>Sending needs your full-access key. Agent keys can't send.</span></div></div>
      <div className="acts"><Cancel /><button className="btn primary" onClick={act.send2}>Confirm with Google</button></div>
    </Frame>
  );
}

/** A scannable QR code of the account name. The QR library loads only when this opens. */
function AccountQr({ acct }: { acct: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let on = true;
    void import('qrcode').then((q) => q.toDataURL(acct, { margin: 1, width: 176 })).then((u) => { if (on) setSrc(u); }, () => undefined);
    return () => { on = false; };
  }, [acct]);
  return src ? <img src={src} width={176} height={176} alt={`QR code for ${acct}`} style={{ borderRadius: 12, background: '#fff' }} /> : <span className="avatar lg"><Icon name="qr" /></span>;
}

function Receive() {
  const { live, chain } = useApp();
  return (
    <Frame>
      <h2>Receive</h2>
      <p className="muted">{live ? <>Ask people to send USDC on NEAR {chain?.usdc ? <>(token <span className="mono">{chain.usdc}</span>)</> : null} to this account. It lands in your NEAR wallet; use Add funds to move it into AGORA.</> : 'Send USDC on NEAR to this account. To pay in from another chain, use Add funds.'}</p>
      <div className="panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>{live && ME.acct ? <AccountQr acct={ME.acct} /> : <span className="avatar lg"><Icon name="qr" /></span>}<span className="mono">{ME.acct}</span>{live && <WalletLine />}</div>
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
        <div className="field"><label htmlFor="w-amt">Amount</label><input className="input num" id="w-amt" placeholder="0.00" defaultValue="100.00" /></div>
      </div>
      <div className="banner info"><Icon name="bolt" /><div className="grow"><b style={{ fontWeight: 500 }}>You receive 99.71 USDC on NEAR</b><span className="muted">About 40 seconds, fee 0.29, quote expires in 2 min</span></div></div>
      <p className="muted xsmall">Intents runs on mainnet only. The demo makes one real 1 USDC payment and links it in the README; everything else here runs on testnet.</p>
      <div className="acts"><button className="btn" onClick={act.intents}>Refresh quote</button><button className="btn primary" onClick={act.intentspay}>Pay with NEAR Intents</button></div>
    </Frame>
  );
}

const REASONS = ['The tests were wrong', 'The review or test run failed', 'Deadline or no delivery'];
function Dispute() {
  const s = useApp();
  return (
    <Frame>
      <h2>Open a dispute</h2>
      <p className="muted">This freezes the {usd(hPrice(s))} USDC payment. First, 3 fresh reviewers re-check everything for free. If you still disagree, you can ask the DAO with a small bond you get back if you're right.</p>
      <div className="field"><span className="lbl-t">What went wrong?</span>
        <div className="chips">{REASONS.map((r) => <button key={r} type="button" className={`chip ${s.dReason === r ? 'on' : ''}`} aria-pressed={s.dReason === r} onClick={() => setState({ dReason: r })}>{r}</button>)}</div>
      </div>
      <div className="field"><label htmlFor="d-why">One line, in your words</label><input className="input" id="d-why" placeholder="e.g. The locked test expects the wrong rounding" /></div>
      <div className="acts"><Cancel /><button className="btn danger" onClick={act.dispute2}>Start free re-check</button></div>
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

function Discard({ job }: { job: string }) {
  return (
    <Frame>
      <h2>Discard {job}?</h2>
      <p className="muted">The request moves to Completed as cancelled. Sellers can no longer offer on it, and this can't be undone.</p>
      <div className="acts"><Cancel label="Keep it" /><button className="btn danger" onClick={act.discardask2}><Icon name="x" />Discard request</button></div>
    </Frame>
  );
}

/** Confirm before a draft is deleted or an open job is cancelled. */
function RemoveJob({ id, kind, title }: { id: string; kind: 'delete' | 'cancel'; title: string }) {
  const [busy, setBusy] = useState(false);
  const del = kind === 'delete';
  const run = async () => {
    setBusy(true);
    const done = await liveRemoveJob(id, kind);
    setBusy(false);
    if (!done) return;
    closeModal();
    if (location.pathname === '/job' || location.pathname === '/ask') go('jobs');
  };
  return (
    <Frame>
      <h2>{del ? 'Delete this draft?' : 'Cancel this job?'}</h2>
      <p><b>{title || id}</b> <span className="mono muted xsmall">{id}</span></p>
      <p className="muted">{del
        ? 'The request and its draft tests are removed for good. Nothing was posted or paid, so no seller sees it.'
        : 'The job leaves Open jobs, offers still waiting are turned down, and any hire offer you sent is withdrawn. No payment was made. The job stays in your history as Cancelled.'}</p>
      <div className="acts"><Cancel label={del ? 'Keep the draft' : 'Keep the job'} /><button className="btn danger" onClick={() => { void run(); }} disabled={busy}>{busy ? (del ? 'Deleting…' : 'Cancelling…') : del ? 'Delete draft' : 'Cancel job'}</button></div>
    </Frame>
  );
}

function RequestService() {
  const { svc } = useApp();
  const g = gigBy(svc);
  const [what, setWhat] = useState(g?.prompt ?? '');
  if (!g) return null;
  return (
    <Frame>
      <h2>Request this service</h2>
      <p className="muted">{g.seller} gets this first. Your agent writes the tests from it, and escrow funds only if they accept.</p>
      <div className="field"><label htmlFor="rq-repo">Repository</label><input className="input" id="rq-repo" placeholder="github.com/you/repo" /></div>
      <div className="field"><label htmlFor="rq-what">What's broken or needed</label><textarea className="input" id="rq-what" placeholder="What is broken, and what done looks like" value={what} onChange={(e) => setWhat(e.target.value)} /></div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="rq-b">Budget</label><input className="input num" id="rq-b" placeholder="e.g. 25.00 USDC" defaultValue={`${g.from}.00 USDC`} /></div>
        <div className="field"><label htmlFor="rq-d">Deliver within</label><select className="input" id="rq-d"><option>{g.days === 1 ? '1 day' : g.days + ' days'}</option><option>1 week</option></select></div>
      </div>
      <div className="acts"><Cancel /><button className="btn primary" onClick={() => act.reqsvc2(what.trim())}>Send request</button></div>
    </Frame>
  );
}

function OtherJob({ id }: { id: string }) {
  const { newJobs } = useApp();
  const j = [...newJobs, ...OTHER_JOBS, ...DONE_JOBS].find((x) => x.id === id);
  if (!j) return null;
  return (
    <Frame>
      <div className="row"><span className={`pill ${j.status[0]}`}>{j.status[1]}</span><span className="mono muted xsmall">{j.id}</span></div>
      <h2>{j.title}</h2>
      <dl className="kv">
        <dt>Category</dt><dd>{j.cat}</dd><dt>Budget</dt><dd>{j.budget} USDC</dd>
        {j.who && <><dt>Seller</dt><dd>{j.who}</dd></>}
        {j.note && <><dt>Status</dt><dd>{j.note}</dd></>}
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
          <div className="field"><label htmlFor="of-p">Your price</label><input className="input num" id="of-p" placeholder="e.g. 42.00 USDC" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="field"><label htmlFor="of-d">Delivery</label><select className="input" id="of-d" value={days} onChange={(e) => setDays(e.target.value)}><option>1 day</option><option>2 days</option><option>3 days</option></select></div>
        </div>
        <div className="field"><label htmlFor="of-n">Note to the buyer</label><textarea className="input" id="of-n" rows={3} placeholder="A short note: how you will do it" defaultValue="I can reproduce it on Safari 18. I will add one extra test for the 390 px layout." /></div>
        <div className="acts"><button type="button" className="btn ghost" data-close="1" onClick={closeModal}>Cancel</button><button type="submit" className="btn primary">Send offer</button></div>
      </form>
    </Frame>
  );
}

export function ModalHost() {
  const { modal, user } = useApp();
  if (!modal) return null;
  switch (modal.kind) {
    case 'signin': return <SignIn />;
    case 'code': return <Code />;
    case 'walletstep': return <WalletStep />;
    case 'walletpick': return user ? <LinkWallet onDone={() => act.walletlinked(true)} back={act.walletstep} /> : <Wallets onPick={act.walletlinked} back={act.walletstep} />;
    case 'linkwallet': return <LinkWallet onDone={closeModal} back={closeModal} />;
    case 'walletmove': return <WalletMove op={modal.props?.op === 'withdraw' ? 'withdraw' : 'deposit'} />;
    case 'wallets': return authConfigured ? <LinkWallet signIn onDone={closeModal} back={act.signin} /> : <Wallets onPick={() => act.signVia('wallet')} back={act.signin} />;
    case 'role': return <RolePicker />;
    case 'send': return <Send />;
    case 'receive': return <Receive />;
    case 'addfunds': return <AddFunds />;
    case 'dispute': return <Dispute />;
    case 'unpause': return <Unpause />;
    case 'reqsvc': return <RequestService />;
    case 'ojob': return <OtherJob id={modal.props?.id ?? ''} />;
    case 'offer': return <Offer id={modal.props?.id ?? ''} />;
    case 'discard': return <Discard job={modal.props?.job ?? ''} />;
    case 'removejob': return <RemoveJob id={modal.props?.id ?? ''} kind={modal.props?.kind === 'delete' ? 'delete' : 'cancel'} title={modal.props?.title ?? ''} />;
    default: return null;
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
