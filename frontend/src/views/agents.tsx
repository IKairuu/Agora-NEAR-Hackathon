import { agentPick, ATTACK, CATS, HELD, JOB, ME, usd } from '../data/data';
import { useEffect, useState } from 'react';
import { act } from '../store/actions';
import { liveEnableAgents, liveFaucet, loadWalletBalances } from '../lib/live';
import { accessKeys, type AccessKeyRow } from '../lib/near';
import { authConfigured } from '../lib/supabase';
import { escrow, free, hb, hPrice, paused, setState, useApp } from '../store/store';
import { Icon, type IconName } from '../ui/icons';
import { Check, Feed, Gate, Head, RLink, SignInButton, T } from '../ui/parts';
import { Shell } from '../ui/Shell';

/* ---------------- agent team ---------------- */
export function Agents() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="agents"><Head title="Agent team" /><Gate msg="Sign in to see your agent team"><SignInButton /></Gate></Shell>;
  const isPaused = paused(s);
  /* live: statuses from the account's own state, never the demo story */
  const lj = s.liveJob?.ref;
  const live = s.live ? {
    spec: lj ? `Working on ${lj}` : 'Waiting for a request',
    pick: agentPick() ? `Picked ${agentPick()!.name} at ${usd(agentPick()!.final)}` : 'Waiting for offers',
    funded: s.money?.escrowed ? `Protecting ${usd(s.money.escrowed)} USDC` : 'Nothing funded yet',
    review: s.votes ? `${s.votes.filter((v) => v === 2).length} of 3 approved` : 'No delivery to review',
    held: HELD.length ? `Held ${HELD.length} offer${HELD.length > 1 ? 's' : ''}` : 'Nothing held',
  } : null;
  const A: [string, string, string, string, boolean][] = [
    ['Spec writer', 'Turns your job post into failing tests and an acceptance spec.', 'No key, advises', live ? live.spec : `Wrote spec for ${JOB.id}`, false],
    ['Buyer agent', 'Shortlists up to 5 bids, waits for 3 offers, negotiates in a TEE, opens the chat.', 'No key, advises', agentPick() ? `Picked ${agentPick()!.name} at ${usd(agentPick()!.final)}` : 'Waiting for offers', false],
    ['Transaction agent', 'The only agent that signs calls that move money.', 'Function-call key, 6 methods, cannot withdraw', live ? live.funded : `Funded ${JOB.id}`, true],
    ['Reviewers, 3', 'Run the locked tests on each delivery and vote.', 'Vote only, shared', live ? live.review : '2 of 3 approved e5f1d07', false],
    ['Fraud and lure', 'Scores every counterparty 0 to 100 and holds lures and outlier prices.', 'Can hold, not pay, shared', live ? live.held : 'Held 2 bids', false],
    ['Guardian', 'Watches your on-chain activity and pauses on unusual patterns.', 'Function-call key, pause only', 'Watching, 0 alerts', false],
    ['Bidding agent', 'Seller side. Bids on jobs that match your skills.', s.seller ? 'Function-call key, bid and deliver' : 'Off while you only buy', s.seller ? 'Watching matching jobs' : 'Off', false],
  ];
  return (
    <Shell cur="agents">
      <Head
        title="Agent team"
        sub={<>Your agents live under <span className="mono">{ME.agents}</span>. They act inside your limits; the contract checks every call.</>}
        actions={<><RLink r="mandate" className="btn">Limits and keys</RLink><button className={`btn ${isPaused ? 'primary' : 'danger'}`} onClick={isPaused ? act.unpause : act.pause}><Icon name="pause" />{isPaused ? 'Unpause agents' : 'Pause all agents'}</button></>}
      />
      <div className="grid g-3">
        {A.map(([name, desc, keys, status, money]) => {
          const off = isPaused && name !== 'Guardian';
          const icon: IconName = off ? 'pause' : status === 'Off' ? 'x' : 'check';
          return (
            <div key={name} className={`agent ${money ? 'money' : ''} ${off ? 'paused' : ''}`}>
              <div className="row" style={{ flexWrap: 'nowrap' }}><span className="avatar ag"><Icon name="bot" /></span><div style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>{name}</b><div className="keys">{keys}</div></div>{money && <span className="pill acc">Moves funds</span>}</div>
              <p className="muted small">{desc}</p>
              <span className={`status ${off ? 'block' : status === 'Off' ? '' : 'ok'}`}><Icon name={icon} />{off ? 'Paused' : status}</span>
            </div>
          );
        })}
      </div>
      <div className="grid g-main">
        {s.tour >= 0 && <div className="panel"><div className="panel-h"><h2>Stolen key drill</h2><div className="r"><span className="muted xsmall">What an attacker with your transaction key can do</span></div></div><div className="panel-b">
          {s.attack ? (
            <>
              <div className="tablewrap"><table>
                <thead><tr><th>Attempted call</th><th>Result</th><th>Stopped by</th></tr></thead>
                <tbody>{ATTACK.slice(0, s.attack.n).map((a) => <tr key={a[0]}><td className="mono">{a[0]}</td><td><span className="pill block">Rejected</span> <span className="muted xsmall">{a[1]}</span></td><td>{a[2]}</td></tr>)}</tbody>
              </table></div>
              {s.attack.n >= ATTACK.length
                ? <div className="banner block"><Icon name="pause" /><div className="grow"><b style={{ fontWeight: 500 }}>Guardian paused all agents</b><span>6 rejected calls in 40 s. 0.00 USDC moved. Rotate the key, then unpause with your full-access key.</span></div></div>
                : <div className="row muted"><span className="spin" />Attacker trying</div>}
            </>
          ) : (
            <>
              <p className="muted">An attacker who steals the transaction agent's key tries to drain your account. Each call goes to the contract, which checks your mandate. The guardian watches the pattern.</p>
              <button className="btn danger" onClick={act.attack} style={{ alignSelf: 'flex-start' }} disabled={isPaused}><Icon name="bolt" />Run the drill</button>
            </>
          )}
        </div></div>}
        <div className="panel"><div className="panel-h"><h2>Timeline</h2></div><div className="panel-b" style={{ paddingBlock: 4 }}><Feed /></div></div>
      </div>
    </Shell>
  );
}

/* ---------------- limits and keys ---------------- */
const money = (n: number) => `${n.toFixed(2)} USDC`;

export function Mandate() {
  const s = useApp();
  const lim = s.live ? s.limits : null;
  // When the saved limits arrive (or change after a save), show them: the boxes are remounted with the new values,
  // and the category chips and strict switch follow the saved mandate.
  const limKey = lim ? JSON.stringify(lim) : 'sample';
  useEffect(() => {
    if (!lim) return;
    setState({ cats: Object.fromEntries(CATS.map(([k]) => [k, lim.categories.includes(k)])), strict: lim.strict });
  }, [limKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const used = s.live ? (s.money?.usedToday ?? 0) : (s.stage >= 5 ? 32 : 0);
  const dayCap = lim?.dailyCap ?? 120;
  if (s.stage < 1) return <Shell cur="mandate"><Head title="Limits and keys" /><Gate msg="Sign in to set your limits"><SignInButton /></Gate></Shell>;
  return (
    <Shell cur="mandate">
      <Head crumbs={<><RLink r="agents">Agent team</RLink> / Limits and keys</>} title="Limits and keys" sub="The contract checks these on every funding call. Your agents can't change them; only your full-access key can." actions={<button className="btn primary" onClick={act.savemandate}>Save limits</button>} />
      <div className="grid g-main">
        <div className="stack">
          <div className="panel"><div className="panel-h"><h2>Spending</h2><div className="r"><T name="Contract-enforced" tip="Checked by the marketplace contract, not by the agent" /></div></div><div className="panel-b">
            <div className="grid g-2" key={limKey}>
              <div className="field"><label htmlFor="m-job">Per-job cap</label><input className="input num" id="m-job" placeholder="e.g. 50.00 USDC" defaultValue={money(lim?.perJobCap ?? 50)} /></div>
              <div className="field"><label htmlFor="m-day">Daily cap</label><input className="input num" id="m-day" placeholder="e.g. 120.00 USDC" defaultValue={money(dayCap)} /><div className="bar"><i style={{ transform: `scaleX(${Math.min(1, used / dayCap)})` }} /></div><span className="hint">{used.toFixed(2)} used today</span></div>
              <div className="field"><label htmlFor="m-new">New-seller value cap</label><input className="input num" id="m-new" placeholder="e.g. 25.00 USDC" defaultValue={money(lim?.newSellerCap ?? 25)} /><span className="hint">For sellers with fewer than 3 settled jobs. The first-job pool covers the gap.</span></div>
              <div className="field"><label htmlFor="m-win">If reviewers stall</label><select className="input" id="m-win" defaultValue={String(lim?.reviewWindowHours ?? 12)}><option value="12">12 hours, then a fresh re-check</option><option value="6">6 hours</option><option value="24">24 hours</option></select></div>
            </div>
            <div className="field"><span className="lab">Allowed categories</span><div className="chips">{CATS.map(([k, label]) => <button key={k} className={`chip ${s.cats[k] ? 'on' : ''}`} aria-pressed={!!s.cats[k]} onClick={() => setState({ cats: { ...s.cats, [k]: !s.cats[k] } })}>{label}</button>)}</div></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button className={`switch ${s.strict ? 'on' : ''}`} onClick={() => setState({ strict: !s.strict })} aria-label="Approved sellers only" aria-pressed={s.strict} />
              <div><b style={{ fontWeight: 500 }}>Approved sellers only</b><div className="muted xsmall">Agents can only fund sellers on your list ({s.strict ? 'on' : 'off'}).</div></div>
            </div>
          </div></div>
          <div className="panel">
            <div className="panel-h"><h2>Keys on {ME.acct}</h2><div className="r"><T name="Function-call keys" tip="NEAR access keys limited to one contract and named methods" /><T name="Sub-account" tip={`${ME.agents} holds agent keys`} /></div></div>
            {s.live ? <LiveKeys /> : <div className="tablewrap"><table>
              <thead><tr><th>Key</th><th>Held by</th><th>Can call</th><th><span className="visually-hidden">Action</span></th></tr></thead>
              <tbody>
                <tr><td className="mono">ed25519:4Fz…9Qa</td><td>You (Google sign-in)</td><td><span className="pill acc">Full access</span> withdraw, unpause, change limits</td><td /></tr>
                <tr><td className="mono">ed25519:7Hk…2mL</td><td>Transaction agent</td><td className="mono xsmall">post_job place_bid accept_offer fund_job submit_delivery vote</td><td><button className="btn sm danger" onClick={act.deletekey}>Delete</button></td></tr>
                <tr><td className="mono">ed25519:Cq1…x8T</td><td>Guardian</td><td className="mono xsmall">pause</td><td><button className="btn sm danger" onClick={act.deletekey}>Delete</button></td></tr>
              </tbody>
            </table></div>}
            <div className="panel-b"><p className="muted xsmall">Agent keys can't withdraw and can't attach a deposit. NEAR enforces this at the protocol level. Deleting <span className="mono">{ME.agents}</span> removes every agent key at once.</p></div>
          </div>
          {s.tour >= 0 && <div className="panel"><div className="panel-h"><h2>Test your limits</h2></div><div className="panel-b">
            <p className="muted">Ask your transaction agent to fund a job that breaks a rule and watch the contract refuse it.</p>
            <div className="row"><button className="btn" onClick={act.overcap}>Fund 400 USDC job</button><button className="btn" onClick={act.wrongcat}>Fund a design job</button><button className="btn" onClick={act.withdraw}>Agent tries to withdraw</button></div>
          </div></div>}
        </div>
        <div className="stack">
          <div className="panel"><div className="panel-h"><h3>Checks on every funding call</h3></div><div className="panel-b">
            {['Not paused', 'Price within per-job cap', 'Today plus price within daily cap', 'Category allowed', 'Seller approved (strict mode)', 'No high fraud flag', 'Price check cleared', 'New-seller cap respected', 'Enough free balance'].map((c) => <Check key={c}>{c}</Check>)}
          </div></div>
          <div className="panel"><div className="panel-h"><h3>Guardian triggers</h3></div><div className="panel-b">
            {['3 or more rejected calls within a minute', 'Spending above 80% of daily cap within 10 min', 'A new seller receiving 3 or more jobs at once'].map((c) => <Check key={c} k="hold">{c}</Check>)}
            <p className="muted xsmall">The guardian can pause. Only you can unpause.</p>
          </div></div>
        </div>
      </div>
    </Shell>
  );
}

/** The signed-in account's real access keys, read from NEAR for the account and its agents sub-account. */
function LiveKeys() {
  const s = useApp();
  const [rows, setRows] = useState<{ acct: string; keys: AccessKeyRow[] | null }[] | null>(null);
  const [err, setErr] = useState(false);
  const accts = [ME.acct, ME.agents].filter((a, i, all) => a && all.indexOf(a) === i);
  const load = () => {
    setErr(false); setRows(null);
    Promise.all(accts.map(async (acct) => ({ acct, keys: await accessKeys(acct) }))).then(setRows, () => setErr(true));
  };
  useEffect(load, [ME.acct, ME.agents]);
  const contract = s.chain?.contract;
  const holder = (acct: string, k: AccessKeyRow) => {
    if (k.full) return acct === ME.acct ? 'You (your wallet)' : 'Full access';
    if (k.receiver === contract && k.methods.includes('fund_job')) return 'Transaction agent';
    if (k.receiver === contract && k.methods.length === 1 && k.methods[0] === 'pause') return 'Guardian';
    if (k.receiver === contract) return 'Agent key';
    return `App login (${k.receiver})`;
  };
  const short = (pk: string) => (pk.length > 20 ? `${pk.slice(0, 12)}…${pk.slice(-4)}` : pk);
  if (!accts.length) return <div className="panel-b"><p className="muted">Link a NEAR wallet to see its keys.</p></div>;
  if (err) return <div className="panel-b"><p className="muted">Could not reach the NEAR network. <button className="lk" onClick={load}>Retry</button></p></div>;
  if (!rows) return <div className="panel-b"><p className="muted">Reading your keys from NEAR…</p></div>;
  return (
    <div className="tablewrap"><table>
      <thead><tr><th>Key</th><th>Account</th><th>Held by</th><th>Can call</th></tr></thead>
      <tbody>
        {rows.flatMap(({ acct, keys }) => !keys?.length
          ? [<tr key={acct}><td className="muted" colSpan={2}><span className="mono">{acct}</span></td><td className="muted" colSpan={2}>Not created on chain yet</td></tr>]
          : keys.map((k) => (
            <tr key={acct + k.publicKey}>
              <td className="mono" title={k.publicKey}>{short(k.publicKey)}</td>
              <td className="mono xsmall">{acct}</td>
              <td>{holder(acct, k)}</td>
              <td>{k.full
                ? <><span className="pill acc">Full access</span> {acct === ME.acct ? 'withdraw, unpause, change limits' : 'everything'}</>
                : <span className="mono xsmall">{k.methods.length ? k.methods.join(' ') : 'any method'} on {k.receiver}{k.allowance !== null ? ` · ${k.allowance} NEAR gas allowance` : ''}</span>}</td>
            </tr>
          )))}
      </tbody>
    </table></div>
  );
}

/* ---------------- wallet, simple like a NEAR wallet ---------------- */
export function Wallet() {
  const s = useApp();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [agentsBusy, setAgentsBusy] = useState(false);
  useEffect(() => { if (s.live) void loadWalletBalances(); }, [s.live]);
  /* real chain, own NEAR wallet, and agents.<you> not set up yet: one signature fixes it (server-made accounts are set up for you) */
  const needAgents = s.live && s.chain?.mode === 'real' && Boolean(ME.acct) && !/^agora-[0-9a-f]{8}\./.test(ME.acct) && s.money?.agentsReady === false;
  if (s.stage < 1) return <Shell cur="wallet"><Head title="Wallet" /><Gate msg="Sign in to see your wallet"><SignInButton /></Gate></Shell>;
  const total = free(s) + escrow(s);
  const [d, c] = usd(total).split('.');
  const mock = !s.live || s.chain?.mode !== 'real';
  const hist: [IconName, string, string, string, string, string][] = [];
  /* the sample history belongs to the demo account; a signed-in account shows its own transactions from the backend */
  const IN = new Set(['deposit', 'refund_milestone', 'refund_expired', 'return_stake']);
  const OUT = new Set(['withdraw', 'starter_stake']);
  const itemIcon = (m: string): IconName => (IN.has(m) || (m === 'ft_transfer_call') ? 'down' : OUT.has(m) ? 'up' : m === 'fund_job' ? 'lock' : 'check');
  const sign = (it: { method: string; label: string }) => (IN.has(it.method) || it.label.startsWith('Deposit') ? '+' : OUT.has(it.method) || it.label.startsWith('Withdraw') ? '−' : '');
  const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const realTx = (h: string | null) => Boolean(h && !h.startsWith('mock-'));
  if (!s.live) {
    if (s.stage >= 7) hist.push(['up', 'Released to ' + hb(s).name, `${JOB.id}, from Protected payment`, '−' + usd(hPrice(s)), '16:31', '9xQe…f2A']);
    if (s.stage >= 5) hist.push(['lock', 'Moved to Protected payment', JOB.id, usd(hPrice(s)), '16:12', '4Lmc…a71']);
    hist.push(['down', 'Deposit', 'ft_transfer_call from your NEAR wallet', '+120.00', '15:58', 'H2ty…0pe']);
  }
  return (
    <Shell cur="wallet">
      <div className="wal">
        <div className="wal-cards">
          <section className="wal-card panel" aria-labelledby="wal-budget">
            {s.live && !s.money
              ? <><span className="lbl" id="wal-budget">Agent budget <span className="tag">in AGORA</span></span><span className="total num loading" aria-busy="true">$—</span><span className="sub">Loading your balance…</span></>
              : (s.money?.earnings ?? []).length === 0
                ? <><span className="lbl" id="wal-budget">Agent budget <span className="tag">in AGORA</span></span><span className="total num">${d}<span className="c">.{c}</span></span><span className="sub">Free {usd(free(s))} · Locked in jobs {usd(escrow(s))}</span></>
                : (
                  /* two pockets: what your buying agents can spend, and what selling has paid you */
                  <div className="wal-split">
                    <div>
                      <span className="lbl" id="wal-budget">Agent budget <span className="tag">buying</span></span>
                      <span className="total sm num">${d}<span className="c">.{c}</span></span>
                      <span className="sub">Free {usd(free(s))} · Locked {usd(escrow(s))}</span>
                    </div>
                    <div className="earn">
                      <span className="lbl">Earnings <span className="tag">selling</span></span>
                      <span className="total sm num">${usd(s.money?.earned ?? 0)}</span>
                      {(s.money?.earnings ?? []).map((e) => (
                        <span key={e.acct} className="sub" title={`Paid out by settled jobs to ${e.acct}`}>{e.name}: {usd(e.available)} · <span className="mono">{e.acct}</span></span>
                      ))}
                    </div>
                  </div>
                )}
            <p className="note">{mock ? 'Test money: the server runs in mock mode, so nothing here is on chain.' : 'Your agents can spend this, only inside your limits.'}</p>
            <div className="wal-acts two">
              <button className="pri" onClick={act.addfunds}><i><Icon name="plus" /></i>Add funds</button>
              <button onClick={act.withdrawme}><i><Icon name="out" /></i>Withdraw</button>
            </div>
          </section>
          <section className="wal-card panel" aria-labelledby="wal-own">
            <span className="lbl" id="wal-own">Your NEAR wallet</span>
            {ME.acct && <button className="acct" onClick={act.copyacct} aria-label="Copy account name">{ME.acct}<Icon name="copy" /></button>}
            {s.walletBal ? <>
              <span className="total sm num">{s.walletBal.usdc === null ? '—' : usd(s.walletBal.usdc)} <span className="c">USDC</span></span>
              <span className="sub">{s.walletBal.near.toFixed(2)} NEAR for fees</span>
            </> : <span className="sub">{!s.live ? 'Sample data: your own wallet shows here after you sign in.' : !ME.acct ? 'Balances show here once your wallet is linked.' : s.walletErr ? 'Could not reach the NEAR network.' : 'Loading your wallet…'}</span>}
            {s.live && s.walletErr && <button className="btn sm" onClick={() => void loadWalletBalances()}>Retry</button>}
            <p className="note">Only you can spend this. Agents can't touch it.</p>
            {needAgents && <>
              <p className="note"><b>One step left:</b> your agents need their own account, agents.{ME.acct}, to post, fund, bid and deliver on NEAR. It takes one signature, and its key works only on AGORA. No NEAR yet? AGORA covers the fee for your first setup.</p>
              <button className="btn sm primary" disabled={agentsBusy} aria-busy={agentsBusy} onClick={() => { setAgentsBusy(true); void liveEnableAgents().finally(() => setAgentsBusy(false)); }}><Icon name="check" />{agentsBusy ? 'Waiting for your wallet…' : 'Enable agents (1 signature)'}</button>
            </>}
            {s.live && s.walletBal && s.chain?.usdc && s.chain.network === 'testnet' && <button className="btn sm" disabled={faucetBusy} aria-busy={faucetBusy} onClick={() => { setFaucetBusy(true); void liveFaucet().finally(() => setFaucetBusy(false)); }}><Icon name="plus" />{faucetBusy ? 'Waiting for your wallet…' : 'Get 50 test USDC'}</button>}
            {s.live && <button className="lk small" onClick={() => setState({ modal: { kind: 'linkwallet' } })}><Icon name="wallet" />{s.walletBal ? 'Link a different wallet' : 'Link your own NEAR wallet'}</button>}
            <div className="wal-acts two">
              <button onClick={act.send}><i><Icon name="up" /></i>Send</button>
              <button onClick={act.receive}><i><Icon name="down" /></i>Receive</button>
            </div>
          </section>
        </div>
        {s.user && authConfigured && (
          <section className="panel" aria-labelledby="wal-ids">
            <div className="panel-h"><h3 id="wal-ids">Linked to this account</h3><span className="muted xsmall">One of each. Any of them signs you in to this same account.</span></div>
            <div className="panel-b">
              <div className="asset"><span className="tok">G</span><div><b style={{ fontWeight: 500 }}>Google</b><div className="muted xsmall">{s.ids.google ?? 'Not linked'}</div></div>
                <div className="v">{s.ids.google ? <button className="btn sm" onClick={() => act.unlinkid('google')}>Unlink</button> : <button className="btn sm" onClick={() => act.linkid('google')}>Link Google</button>}</div></div>
              <div className="asset"><span className="tok"><Icon name="github" /></span><div><b style={{ fontWeight: 500 }}>GitHub</b><div className="muted xsmall mono">{s.ids.github ?? 'Not linked'}</div></div>
                <div className="v">{s.ids.github ? <button className="btn sm" onClick={() => act.unlinkid('github')}>Unlink</button> : <button className="btn sm" onClick={() => act.linkid('github')}>Link GitHub</button>}</div></div>
              <div className="asset"><span className="tok near">N</span><div><b style={{ fontWeight: 500 }}>NEAR wallet</b><div className="muted xsmall mono">{ME.acct || 'Not linked'}</div></div>
                <div className="v"><button className="btn sm" onClick={() => setState({ modal: { kind: 'linkwallet' } })}>{ME.acct ? 'Change' : 'Link wallet'}</button></div></div>
            </div>
          </section>
        )}
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={s.walTab === 'assets'} className={s.walTab === 'assets' ? 'on' : ''} onClick={() => setState({ walTab: 'assets' })}>Assets</button>
          <button role="tab" aria-selected={s.walTab === 'activity'} className={s.walTab === 'activity' ? 'on' : ''} onClick={() => setState({ walTab: 'activity' })}>Activity</button>
        </div>
        {s.walTab === 'assets' ? (
          <div className="panel">
            <div className="asset"><span className="tok">USDC</span><div><b style={{ fontWeight: 500 }}>USD Coin</b><div className="muted xsmall">Available to fund jobs</div></div><div className="v"><b>{usd(free(s))}</b><span className="muted xsmall">${usd(free(s))}</span></div></div>
            <div className="asset"><span className="tok lock"><Icon name="lock" /></span><div><b style={{ fontWeight: 500 }}>Protected payment</b><div className="muted xsmall">{escrow(s) ? `Held by the contract${s.live ? '' : ` for ${JOB.id}`}` : 'Nothing locked'}</div></div><div className="v"><b>{usd(escrow(s))}</b><span className="muted xsmall">${usd(escrow(s))}</span></div></div>
            <div className="asset"><span className="tok near">N</span><div><b style={{ fontWeight: 500 }}>NEAR</b><div className="muted xsmall">Gas, paid for you by the AGORA relayer</div></div><div className="v"><b>0.00</b><span className="muted xsmall">0.0041 covered</span></div></div>
          </div>
        ) : (
          <div className="panel">
            {s.live && s.walletItems.map((it) => (
              <div key={it.id} className="asset">
                <span className="tok lock"><Icon name={itemIcon(it.method)} /></span>
                <div>
                  <b style={{ fontWeight: 500 }}>{it.label}</b>{it.status !== 'success' && it.status !== 'confirmed' && <span className={`pill ${it.error ? 'block' : 'hold'}`} style={{ marginLeft: 8 }}>{it.error ? 'Refused' : it.status}</span>}
                  <div className="muted xsmall">{[it.job, when(it.at)].filter(Boolean).join(', ')}{realTx(it.txHash) && it.explorer ? <>, <a className="mono" href={it.explorer} target="_blank" rel="noreferrer">tx {it.txHash!.slice(0, 4)}…{it.txHash!.slice(-4)}</a></> : null}</div>
                  {it.error && <div className="muted xsmall">{it.error}</div>}
                </div>
                <div className="v"><b>{it.amount === null ? '' : `${sign(it)}${usd(it.amount)}`}</b><span className="muted xsmall">{it.amount === null ? '' : 'USDC'}</span></div>
              </div>
            ))}
            {!hist.length && !(s.live && s.walletItems.length) && <div className="panel-b"><div className="empty"><Icon name="wallet" /><b>No transactions to show yet</b><span>Deposits, protected payments and releases on this account appear here.</span></div></div>}
            {hist.map((h) => <div key={h[1]} className="asset"><span className="tok lock"><Icon name={h[0]} /></span><div><b style={{ fontWeight: 500 }}>{h[1]}</b><div className="muted xsmall">{h[2]}, {h[4]}, tx <span className="mono">{h[5]}</span></div></div><div className="v"><b>{h[3]}</b><span className="muted xsmall">USDC</span></div></div>)}
          </div>
        )}
        <div className="banner info"><Icon name="shield" /><div className="grow"><b style={{ fontWeight: 500 }}>Agents can't take money out</b><span className="muted">Withdrawals and sends need your full-access key. Agent keys can only call the six job methods.</span></div></div>
      </div>
    </Shell>
  );
}
