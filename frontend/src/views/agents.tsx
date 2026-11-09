import { agentPick, ATTACK, CATS, ME, usd } from '../data/data';
import { act } from '../store/actions';
import { escrow, free, hb, hPrice, paused, setState, useApp } from '../store/store';
import { Icon, type IconName } from '../ui/icons';
import { Check, Feed, Gate, Head, RLink, SignInButton, T } from '../ui/parts';
import { Shell } from '../ui/Shell';

/* ---------------- agent team ---------------- */
export function Agents() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="agents"><Head title="Agent team" /><Gate msg="Sign in to see your agent team"><SignInButton /></Gate></Shell>;
  const isPaused = paused(s);
  const A: [string, string, string, string, boolean][] = [
    ['Spec writer', 'Turns your job post into failing tests and an acceptance spec.', 'No key, advises', 'Wrote spec for J-1042', false],
    ['Buyer agent', 'Shortlists up to 5 bids, waits for 3 offers, negotiates in a TEE, opens the chat.', 'No key, advises', agentPick() ? `Picked ${agentPick()!.name} at ${usd(agentPick()!.final)}` : 'Waiting for offers', false],
    ['Transaction agent', 'The only agent that signs calls that move money.', 'Function-call key, 6 methods, cannot withdraw', 'Funded J-1042', true],
    ['Reviewers, 3', 'Run the locked tests on each delivery and vote.', 'Vote only, shared', '2 of 3 approved e5f1d07', false],
    ['Fraud and lure', 'Scores every counterparty 0 to 100 and holds lures and outlier prices.', 'Can hold, not pay, shared', 'Held 2 bids', false],
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
export function Mandate() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="mandate"><Head title="Limits and keys" /><Gate msg="Sign in to set your limits"><SignInButton /></Gate></Shell>;
  return (
    <Shell cur="mandate">
      <Head crumbs={<><RLink r="agents">Agent team</RLink> / Limits and keys</>} title="Limits and keys" sub="The contract checks these on every funding call. Your agents can't change them; only your full-access key can." actions={<button className="btn primary" onClick={act.savemandate}>Save limits</button>} />
      <div className="grid g-main">
        <div className="stack">
          <div className="panel"><div className="panel-h"><h2>Spending</h2><div className="r"><T name="Contract-enforced" tip="Checked by the marketplace contract, not by the agent" /></div></div><div className="panel-b">
            <div className="grid g-2">
              <div className="field"><label htmlFor="m-job">Per-job cap</label><input className="input num" id="m-job" placeholder="e.g. 50.00 USDC" defaultValue="50.00 USDC" /></div>
              <div className="field"><label htmlFor="m-day">Daily cap</label><input className="input num" id="m-day" placeholder="e.g. 120.00 USDC" defaultValue="120.00 USDC" /><div className="bar"><i style={{ transform: `scaleX(${s.stage >= 5 ? 0.27 : 0})` }} /></div><span className="hint">{s.stage >= 5 ? '32.00' : '0.00'} used today</span></div>
              <div className="field"><label htmlFor="m-new">New-seller value cap</label><input className="input num" id="m-new" placeholder="e.g. 25.00 USDC" defaultValue="25.00 USDC" /><span className="hint">For sellers with fewer than 3 settled jobs. The first-job pool covers the gap.</span></div>
              <div className="field"><label htmlFor="m-win">If reviewers stall</label><select className="input" id="m-win"><option>12 hours, then a fresh re-check</option><option>6 hours</option><option>24 hours</option></select></div>
            </div>
            <div className="field"><span className="lab">Allowed categories</span><div className="chips">{CATS.map(([k, label]) => <button key={k} className={`chip ${s.cats[k] ? 'on' : ''}`} aria-pressed={!!s.cats[k]} onClick={() => setState({ cats: { ...s.cats, [k]: !s.cats[k] } })}>{label}</button>)}</div></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button className={`switch ${s.strict ? 'on' : ''}`} onClick={() => setState({ strict: !s.strict })} aria-label="Approved sellers only" aria-pressed={s.strict} />
              <div><b style={{ fontWeight: 500 }}>Approved sellers only</b><div className="muted xsmall">Agents can only fund sellers on your list ({s.strict ? 'on' : 'off'}).</div></div>
            </div>
          </div></div>
          <div className="panel">
            <div className="panel-h"><h2>Keys on {ME.acct}</h2><div className="r"><T name="Function-call keys" tip="NEAR access keys limited to one contract and named methods" /><T name="Sub-account" tip={`${ME.agents} holds agent keys`} /></div></div>
            <div className="tablewrap"><table>
              <thead><tr><th>Key</th><th>Held by</th><th>Can call</th><th><span className="visually-hidden">Action</span></th></tr></thead>
              <tbody>
                <tr><td className="mono">ed25519:4Fz…9Qa</td><td>You (Google sign-in)</td><td><span className="pill acc">Full access</span> withdraw, unpause, change limits</td><td /></tr>
                <tr><td className="mono">ed25519:7Hk…2mL</td><td>Transaction agent</td><td className="mono xsmall">post_job place_bid accept_offer fund_job submit_delivery vote</td><td><button className="btn sm danger" onClick={act.deletekey}>Delete</button></td></tr>
                <tr><td className="mono">ed25519:Cq1…x8T</td><td>Guardian</td><td className="mono xsmall">pause</td><td><button className="btn sm danger" onClick={act.deletekey}>Delete</button></td></tr>
              </tbody>
            </table></div>
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

/* ---------------- wallet, simple like a NEAR wallet ---------------- */
export function Wallet() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="wallet"><Head title="Wallet" /><Gate msg="Sign in to see your wallet"><SignInButton /></Gate></Shell>;
  const total = free(s) + escrow(s);
  const [d, c] = usd(total).split('.');
  const hist: [IconName, string, string, string, string, string][] = [];
  if (s.stage >= 7) hist.push(['up', 'Released to ' + hb(s).name, 'J-1042, from Protected payment', '−' + usd(hPrice(s)), '16:31', '9xQe…f2A']);
  if (s.stage >= 5) hist.push(['lock', 'Moved to Protected payment', 'J-1042', usd(hPrice(s)), '16:12', '4Lmc…a71']);
  hist.push(['down', 'Deposit', 'ft_transfer_call from your NEAR wallet', '+120.00', '15:58', 'H2ty…0pe']);
  return (
    <Shell cur="wallet">
      <div className="wal">
        <div className="wal-card panel">
          <button className="acct" onClick={act.copyacct} aria-label="Copy account name">{ME.acct}<Icon name="copy" /></button>
          <span className="lbl">Total balance</span>
          <span className="total num">${d}<span className="c">.{c}</span></span>
          <span className="sub">{usd(free(s))} available{escrow(s) ? `, ${usd(escrow(s))} protected` : ''}</span>
          <div className="wal-acts">
            <button className="pri" onClick={act.addfunds}><i><Icon name="plus" /></i>Add funds</button>
            <button onClick={act.send}><i><Icon name="up" /></i>Send</button>
            <button onClick={act.receive}><i><Icon name="down" /></i>Receive</button>
            <button onClick={act.withdrawme}><i><Icon name="out" /></i>Withdraw</button>
          </div>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={s.walTab === 'assets'} className={s.walTab === 'assets' ? 'on' : ''} onClick={() => setState({ walTab: 'assets' })}>Assets</button>
          <button role="tab" aria-selected={s.walTab === 'activity'} className={s.walTab === 'activity' ? 'on' : ''} onClick={() => setState({ walTab: 'activity' })}>Activity</button>
        </div>
        {s.walTab === 'assets' ? (
          <div className="panel">
            <div className="asset"><span className="tok">USDC</span><div><b style={{ fontWeight: 500 }}>USD Coin</b><div className="muted xsmall">Available to fund jobs</div></div><div className="v"><b>{usd(free(s))}</b><span className="muted xsmall">${usd(free(s))}</span></div></div>
            <div className="asset"><span className="tok lock"><Icon name="lock" /></span><div><b style={{ fontWeight: 500 }}>Protected payment</b><div className="muted xsmall">{escrow(s) ? 'Held by the contract for J-1042' : 'Nothing locked'}</div></div><div className="v"><b>{usd(escrow(s))}</b><span className="muted xsmall">${usd(escrow(s))}</span></div></div>
            <div className="asset"><span className="tok near">N</span><div><b style={{ fontWeight: 500 }}>NEAR</b><div className="muted xsmall">Gas, paid for you by the AGORA relayer</div></div><div className="v"><b>0.00</b><span className="muted xsmall">0.0041 covered</span></div></div>
          </div>
        ) : (
          <div className="panel">
            {hist.map((h) => <div key={h[1]} className="asset"><span className="tok lock"><Icon name={h[0]} /></span><div><b style={{ fontWeight: 500 }}>{h[1]}</b><div className="muted xsmall">{h[2]}, {h[4]}, tx <span className="mono">{h[5]}</span></div></div><div className="v"><b>{h[3]}</b><span className="muted xsmall">USDC</span></div></div>)}
          </div>
        )}
        <div className="banner info"><Icon name="shield" /><div className="grow"><b style={{ fontWeight: 500 }}>Agents can't take money out</b><span className="muted">Withdrawals and sends need your full-access key. Agent keys can only call the six job methods.</span></div></div>
      </div>
    </Shell>
  );
}
