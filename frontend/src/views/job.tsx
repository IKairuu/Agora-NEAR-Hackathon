import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { agentPick, ARRIVE, ATT, BIDS, HELD, JOB, KICKOFF, ME, NEG_LOG, REVIEWERS, sellerBy, SPEC, usd, type Bid } from '../data/data';
import { act, hire, isUnread, markSeen, openRequest, scrollMsgs, sendChat, sendThread, threads, type Thread } from '../store/actions';
import { getState, hb, hPrice, priceOf, setState, useApp, type ChatMsg, type State } from '../store/store';
import { Icon, type IconName } from '../ui/icons';
import { Gate, Head, Lifecycle, Mk, RLink, SignInButton, T, Tl } from '../ui/parts';
import { Shell } from '../ui/Shell';
import { OrderAction } from './orders';

function SpecTable() {
  return (
    <div className="tablewrap"><table>
      <thead><tr><th>Check</th><th>How reviewers verify it</th><th>Weight</th></tr></thead>
      <tbody>{SPEC.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="muted">{r[1]}</td><td><span className={`pill ${r[2] === 'Required' ? 'acc' : ''}`}>{r[2]}</span></td></tr>)}</tbody>
    </table></div>
  );
}

/* ---------------- job page: offers, negotiation, spec ---------------- */
function BidsView({ bidsIn, neg }: { bidsIn: boolean; neg: boolean }) {
  if (!bidsIn) return (
    <div className="empty"><Icon name="job" /><b>Waiting for offers</b><span>Your agent won't pick a seller until at least 3 offers arrive or 30 minutes pass. This stops it from taking the first, fastest bid.</span><button className="btn primary" onClick={act.bids}>Simulate bids arriving</button></div>
  );
  return (
    <>
      <div className="panel">
        <div className="panel-h"><h2>Shortlist</h2><span className="muted xsmall">Ranked by your buyer agent. Objective outcomes weigh more than stars.</span></div>
        {BIDS.map((b, i) => (
          <div key={b.key} className={`bid ${i === 0 && neg ? 'top' : ''}`}>
            <span className={`avatar ${b.kind === 'agent' ? 'ag' : ''}`}>{b.name.slice(0, 2).toUpperCase()}</span>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="row" style={{ gap: 8 }}>
                <b style={{ fontWeight: 500 }}>{b.name}</b><span className={`pill ${b.kind === 'agent' ? 'info' : ''}`}>{b.kind === 'agent' ? 'AI agent' : 'Developer'}</span>
                {i === 0 && neg && <span className="pill ok">Agent's pick</span>}
                {neg && i > 0 && i < 3 && <span className="pill">Backup {i}</span>}
                {b.newSeller && <span className="pill hold">New, first-job pool</span>}
              </div>
              <span className="mono muted xsmall" style={{ overflowWrap: 'anywhere' }}>{b.acct}</span><span className="muted xsmall">{b.owner}</span><p className="small">{b.note}</p>
              <div className="meta"><span>{b.settled} settled</span><span>{b.pass} pass first try</span><span>{b.buyers} buyers</span><span>{b.disputes} disputes</span><span className="score">Risk <span className="bar"><i style={{ transform: `scaleX(${b.fraud / 100})` }} /></span>{b.fraud}/100</span></div>
            </div>
            <div className="price"><b>{i === 0 && neg ? <><s>{usd(b.price)}</s>{usd(b.final)}</> : usd(b.price)}</b><span className="muted xsmall">USDC, {b.days}</span></div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-h"><Icon name="warn" /><h2>Held by safety agents</h2><span className="muted xsmall">Not shown to your buyer agent. You can review them.</span></div>
        {HELD.map((h) => (
          <div key={h.name} className="bid held">
            <span className="avatar held">{h.name.slice(0, 2).toUpperCase()}</span>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 500 }}>{h.name}</b><span className="pill hold">{h.why}</span></div>
              <span className="mono muted xsmall">{h.acct}</span><div className="quote">{h.text}</div>
              <div className="meta"><span className="score">Risk <span className="bar block"><i style={{ transform: `scaleX(${h.fraud / 100})` }} /></span>{h.fraud}/100</span><span>{h.why === 'Off-platform request' ? "Escrow pays only the job's seller account, so this text can't move money." : '94% below the reference price. Seller can explain within 24 h.'}</span></div>
            </div>
            <div className="price"><b>{usd(h.price)}</b><span className="muted xsmall">USDC</span></div>
          </div>
        ))}
      </div>
    </>
  );
}

function NegView({ neg, canNegotiate }: { neg: boolean; canNegotiate: boolean }) {
  if (!neg) return (
    <div className="empty"><Icon name="bolt" /><b>No negotiation yet</b><span>Once 3 valid offers are in, your agent shortlists and negotiates. Every message and reason shows up here.</span>{canNegotiate && <button className="btn primary" onClick={act.negotiate}>Let my agent negotiate</button>}</div>
  );
  if (!NEG_LOG.length) return (
    <div className="empty"><Icon name="bolt" /><b>The negotiation log is not available yet</b><span>Your agent's messages with sellers on this job show up in its chat once offers are in.</span><RLink r="ask" className="btn sm" onClick={openRequest}>Back to the offers</RLink></div>
  );
  return (
    <div className="panel">
      <div className="panel-h"><h2>Negotiation log</h2><div className="r"><T name="NEAR AI Cloud" tip="Runs in a TEE; log is attested" /><span className="pill ok">2 rounds, agreed</span></div></div>
      <div className="panel-b">
        <div className="feed">
          {NEG_LOG.map((l) => (
            <div key={l[0] + l[1]} className="feed-i">
              <Icon name={(l[2] === 'hold' ? 'warn' : l[2] === 'ok' ? 'check' : 'chat') as IconName} className={l[2]} />
              <div><b style={{ fontWeight: 500 }}>{l[1]}</b><div className="muted">{l[3]}</div></div><time>{l[0]}</time>
            </div>
          ))}
        </div>
        <div className="row"><RLink r="ask" className="btn sm primary" onClick={openRequest}>Back to the offers</RLink></div>
      </div>
    </div>
  );
}

export function Job() {
  const s = useApp();
  if (s.stage < 2) return <Shell cur="job"><Head title={JOB.id ? `Job ${JOB.id}` : 'Job'} /><Gate msg="This job has not been posted yet"><RLink r="ask" className="btn primary">Start a request</RLink></Gate></Shell>;
  const bidsIn = s.stage >= 3, neg = s.stage >= 4, accepted = s.stage >= 5;
  const tab = (id: typeof s.jobTab, label: string) => <button role="tab" aria-selected={s.jobTab === id} className={s.jobTab === id ? 'on' : ''} onClick={() => setState({ jobTab: id })}>{label}</button>;
  return (
    <Shell cur="job">
      <Head
        crumbs={<><RLink r="jobs">Job requests</RLink> / {JOB.id}</>}
        title={JOB.title}
        sub={<>{JOB.cat}, posted {JOB.posted}, spec <span className="mono">{JOB.specHash}</span></>}
        actions={accepted ? <RLink r="room" className="btn primary"><Icon name="lock" />Protected payment</RLink> : s.offerSt ? <RLink r="chat" className="btn primary"><Icon name="chat" />Chat room</RLink> : undefined}
      />
      <Lifecycle />
      <div className="tabs" role="tablist">{tab('bids', `Offers${bidsIn ? ', 4 plus 2 held' : ''}`)}{tab('neg', 'Negotiation log')}{tab('spec', 'Acceptance spec')}</div>
      <div className="grid g-main">
        <div className="stack">
          {s.jobTab === 'bids' ? <BidsView bidsIn={bidsIn} neg={neg} /> : s.jobTab === 'neg' ? <NegView neg={neg} canNegotiate={bidsIn} /> : (
            <div className="panel"><div className="panel-h"><h2>Acceptance spec</h2><div className="r"><span className="mono muted xsmall">{JOB.specHash}</span><span className="pill acc"><Icon name="lock" />Locked</span></div></div><div className="panel-b"><SpecTable /></div></div>
          )}
        </div>
        <div className="stack">
          <div className="panel"><div className="panel-h"><h3>Your buyer agent</h3><div className="r"><T name="TEE" tip="Negotiates inside NEAR AI Cloud; your limit stays private" /></div></div><div className="panel-b">
            <dl className="kv">
              <dt>Private limit</dt><dd className="num">38.00 USDC, hidden</dd><dt>Rule</dt><dd>3 offers or a 30 min window</dd><dt>Shortlist</dt><dd>At most 5 bids</dd><dt>Rounds</dt><dd>Up to 3</dd>
              <dt>Status</dt><dd>{accepted ? <span className="pill ok">Accepted</span> : neg ? <span className="pill info">Negotiated with {agentPick()?.name ?? 'the seller'}</span> : bidsIn ? <span className="pill info">Ranking 4 bids</span> : <span className="pill">Waiting, 0 of 3</span>}</dd>
            </dl>
            {bidsIn && !neg && <button className="btn primary" onClick={act.negotiate}><Icon name="bolt" />Let my agent negotiate</button>}
            {neg && !accepted && (
              <>
                <button className="btn primary" onClick={act.fund}><Icon name="brief" />Send hire offer to {agentPick()?.name ?? hb(s).name}</button>
                <button className="btn sm danger" onClick={act.overcap}>Try funding a 400 USDC job instead</button>
              </>
            )}
            {!bidsIn && <button className="btn" onClick={act.bids}>Simulate bids arriving</button>}
          </div></div>
          <div className="panel"><div className="panel-h"><h3>Price check</h3><span className="muted xsmall">by the fraud and lure agent</span></div><div className="panel-b">
            <dl className="kv"><dt>Reference for this kind of job</dt><dd className="num">28–45 USDC</dd><dt>Median valid bid</dt><dd className="num">{bidsIn ? '35.50' : 'none yet'}</dd><dt>Held for price</dt><dd>{bidsIn ? '1 bid' : 'none'}</dd></dl>
            <p className="muted xsmall">Sellers whose bid is held get a chance to explain before it is shown.</p>
          </div></div>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- Messages: one inbox, a thread per job and seller ---------------- */
type Who = { name: string; kind: 'agent' | 'human' | 'person' };
function Msg({ m, b, sellMode = false }: { m: ChatMsg; b: Who; sellMode?: boolean }) {
  const av = <span className={`avatar ${b.kind === 'agent' ? 'ag' : ''}`}>{b.name.slice(0, 2).toUpperCase()}</span>;
  if (m.from === 'them') return <div className="msg them">{av}<div><div className="who">{b.name}</div><div className="bub">{m.text}</div></div></div>;
  if (m.from === 'agent') return <div className="msg bot"><span className="avatar ag"><Icon name="bot" /></span><div><div className="who">{sellMode ? 'Your bidding agent, for you' : 'Your buyer agent, for you'}</div><div className="bub">{m.text}</div></div></div>;
  if (m.from === 'held' || m.from === 'sys') return <div className="sys">{m.text}</div>;
  return <div className="msg me"><span className="avatar">{ME.initials}</span><div><div className="who">You</div><div className="bub">{m.text}</div></div></div>;
}
const initials = (t: Thread) => (t.ag ? <Icon name="bot" /> : t.who.slice(0, 2).toUpperCase());

function PCard({ icon, k = '', title, t, children }: { icon: IconName; k?: string; title: ReactNode; t: string; children: ReactNode }) {
  return <div className={`pcard ${k}`}><div className="pc-h"><Icon name={icon} /><b>{title}</b><time>{t}</time></div>{children}</div>;
}
function OfferCard({ s, x }: { s: State; x: Bid }) {
  return (
    <PCard icon="brief" title="Hire offer sent by your agent" t="16:11:52">
      <dl className="kv"><dt>To</dt><dd>{x.name}</dd><dt>Price</dt><dd className="num">{usd(priceOf(s, x))} USDC, 1 milestone</dd><dt>Delivery</dt><dd>{x.days}, up to {x.attempts ?? ATT} attempts</dd><dt>Tests</dt><dd><span className="mono">{JOB.specHash}</span>, locked</dd><dt>Payment</dt><dd>Protected the moment you accept</dd></dl>
    </PCard>
  );
}
/** The next lowest valid offer the buyer hasn't been declined by. */
function nextOffer(s: State) {
  return ARRIVE.map((k) => BIDS.find((b) => b.key === k)).filter((b): b is Bid => !!b && !s.declined.includes(b.key)).sort((a, b) => priceOf(s, a) - priceOf(s, b))[0];
}

/** The demo thread: hire offer cards, then the chat with the hired seller. */
function DemoThread({ s, log }: { s: State; log: ChatMsg[] }) {
  const b = hb(s), accepted = s.stage >= 5, amt = usd(hPrice(s));
  const nx = s.offerSt === 'declined' ? nextOffer(s) : undefined;
  return (
    <>
      <div className="sys">You chose {b.name}. Your agent sends the hire offer, and every step is logged in Job requests. Messages stay on AGORA, and money only moves through Protected payment.</div>
      {s.declined.filter((k) => k !== b.key).map((k) => { const x = sellerBy(k)!; return (
        <Fragment key={k}>
          <OfferCard s={s} x={x} />
          <PCard icon="x" k="block" title={`${x.name} declined`} t="16:12"><p className="muted small">Nothing was locked. Your agent moved to the next offer.</p></PCard>
        </Fragment>
      ); })}
      <OfferCard s={s} x={b} />
      {accepted ? (
        <>
          <PCard icon="check" k="ok" title={`${b.name} accepted the offer`} t="16:12:01"><p className="muted small">The contract checked that the seller is not you or one of your agents.</p></PCard>
          <PCard icon="lock" k="ok" title="Payment protected" t="16:12:02">
            <p className="small"><b className="num">{amt} USDC</b> moved into Protected payment by your transaction agent. 9 limit checks passed: per-job cap, daily cap, category, fraud flag, price check and more.</p>
            <p className="muted xsmall">Held in USDC escrow by the contract. It pays {b.name} when 2 of 3 reviewers pass the tests.</p>
          </PCard>
        </>
      ) : s.offerSt === 'declined' ? (
        <>
          <PCard icon="x" k="block" title={`${b.name} declined`} t="16:12"><p className="muted small">Nothing was locked.</p></PCard>
          <div className="msg bot"><span className="avatar ag"><Icon name="bot" /></span><div>
            <div className="who">Your buyer agent, for you</div>
            <div className="bub">{nx ? `The next lowest valid offer is ${nx.name} at ${usd(priceOf(s, nx))} USDC. Send the same offer?` : 'No valid offers left. You can post the job publicly.'}</div>
            {nx && <div className="cc-acts"><button className="btn sm primary" onClick={() => hire(nx.key)}>Send offer to {nx.name}</button><RLink r="ask" className="btn sm ghost" onClick={openRequest}>Back to offers</RLink></div>}
          </div></div>
        </>
      ) : (
        <PCard icon="chat" k="wait" title={`Waiting for ${b.name} to accept or decline`} t="now">
          <p className="muted small">{b.kind === 'agent' ? 'Seller agents usually answer in seconds.' : 'Most developers answer within an hour.'} If they decline, your agent offers the job to the next one.</p>
          <div className="cc-acts"><button className="btn sm" onClick={act.selleraccept}>Seller accepts, demo</button><button className="btn sm ghost" onClick={act.sellerdecline}>Seller declines, demo</button></div>
        </PCard>
      )}
      {log.map((m, i) => <Msg key={i} m={m} b={b} />)}
      {s.typing && <div className="msg them"><span className={`avatar ${b.kind === 'agent' ? 'ag' : ''}`}>{b.name.slice(0, 2).toUpperCase()}</span><div className="bub typing" aria-label={`${b.name} is typing`}><i /><i /><i /></div></div>}
    </>
  );
}

export function Chat() {
  const s = useApp();
  const [text, setText] = useState('');
  const f = s.inboxF || (s.mode === 'sell' ? 'sell' : 'buy');
  const all = s.stage >= 1 ? threads() : [];
  const list = all.filter((t) => f === 'all' || t.mode === f);
  const cur = list.find((t) => t.k === s.thread) || list[0];
  const curKey = cur?.k ?? '';
  useEffect(() => { if (curKey && curKey !== getState().thread) setState({ thread: curKey }); markSeen(curKey); }, [curKey]);
  const opened = useRef(false);
  /* like the prototype, keep the newest message in view after switching threads, not on first open */
  useEffect(() => { if (!opened.current) { opened.current = true; return; } scrollMsgs(); }, [curKey]);
  if (s.stage < 1) return <Shell cur="chat"><Head title="Messages" /><Gate msg="Sign in to see your messages"><SignInButton /></Gate></Shell>;

  const filters: ['buy' | 'sell' | 'all', string][] = [['buy', 'Buying'], ['sell', 'Selling'], ['all', 'All']];
  const side = (
    <aside className="inbox-l">
      <div className="seg ib-f" role="group" aria-label="Show threads">
        {filters.map(([k, label]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setState({ inboxF: k, thread: '' })} aria-pressed={f === k}>{label} <span className="tcount">{all.filter((t) => k === 'all' || t.mode === k).length}</span></button>)}
      </div>
      <div className="tlist">
        {list.length ? list.map((t) => {
          const on = t.k === curKey;
          return (
            <button key={t.k} className={`trow ${on ? 'on' : ''}`} onClick={() => setState({ thread: t.k })} aria-current={on}>
              <span className={`avatar ${t.ag ? 'ag' : ''}`}>{initials(t)}</span>
              <span className="tr-b">
                <span className="tr-top"><b>{t.who}</b><span className="muted xsmall">{t.time}</span></span>
                <span className="tr-job">{t.job} · {t.title}</span>
                <span className="tr-last">{t.last}</span>
              </span>
              {isUnread(t) && !on && <i className="udot" aria-label="Unread" />}
            </button>
          );
        }) : <p className="muted small" style={{ padding: 16 }}>No conversations yet.</p>}
      </div>
    </aside>
  );
  if (!cur) return (
    <Shell cur="chat">
      <Head title="Messages" />
      <div className="inbox">{side}<section className="inbox-r"><div className="empty"><Icon name="chat" /><b>No conversations here</b><span>Threads start when your agent picks a seller, or a buyer sends you a request.</span></div></section></div>
    </Shell>
  );

  const demo = cur.k === 'demo';
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (demo) sendChat(text); else sendThread(text); setText(''); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
  let strip: ReactNode, body: ReactNode, quick: string[] = [];
  if (demo) {
    const b = hb(s), accepted = s.stage >= 5, log = cur.msgs;
    quick = accepted && log.length === 1 ? (KICKOFF[b.key] ? ['Yes, always to the last worker', 'Split the remainder evenly', 'Let me check and come back'] : ['Sounds good', 'Ping me if the spec is unclear']) : [];
    strip = (
      <div className="jstrip">
        <span className={`pill ${cur.st[0]}`}>{cur.st[1]}</span><RLink r="jobs" className="mono xsmall">{JOB.id}</RLink><b className="js-t">{JOB.title}</b>
        <span className="num js-a">{usd(hPrice(s))} USDC · {b.days}</span>
        {accepted && <RLink r="room" className="btn sm"><Icon name="lock" />Protected payment</RLink>}
      </div>
    );
    body = <DemoThread s={s} log={log} />;
  } else {
    const b: Who = { name: cur.who, kind: cur.ag ? 'agent' : 'person' };
    strip = (
      <div className="jstrip">
        <span className={`pill ${cur.st[0]}`}>{cur.st[1]}</span><span className="mono xsmall muted">{cur.job}</span><b className="js-t">{cur.title}</b>
        <span className="num js-a">{cur.amt} USDC</span>
        {cur.order ? <OrderAction o={cur.order} full={false} /> : <RLink r="jobs" className="btn sm">View job</RLink>}
      </div>
    );
    body = cur.msgs.map((m, i) => <Msg key={i} m={m} b={b} sellMode={cur.mode === 'sell'} />);
  }

  return (
    <Shell cur="chat">
      <Head title="Messages" />
      <div className="inbox">
        {side}
        <section className="inbox-r" aria-label={`Conversation with ${cur.who}`}>
          <div className="ib-head"><span className={`avatar ${cur.ag ? 'ag' : ''}`}>{initials(cur)}</span><div><b>{cur.who}</b><div className="muted xsmall">{cur.mode === 'sell' ? 'Buyer' : 'Seller'}{cur.ag ? ', AI agent' : ''}</div></div></div>
          {strip}
          <div className="msgs" id="msgs" aria-live="polite">{body}</div>
          {quick.length > 0 && <div className="quick">{quick.map((q) => <button key={q} className="chip" onClick={() => sendChat(q)}>{q}</button>)}</div>}
          <form className="compose" onSubmit={submit}>
            <label className="visually-hidden" htmlFor="chat-in">Message {cur.who}</label>
            <textarea className="input" id="chat-in" rows={1} placeholder={`Message ${cur.who}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
            <button className="btn primary icon" type="submit" aria-label="Send"><Icon name="up" /></button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

/* ---------------- Protected payment ---------------- */
function DeliveriesPanel({ s }: { s: State }) {
  const H = hb(s);
  if (s.live) {
    const reviewing = s.voting || !!s.votes;
    return (
      <div className="panel">
        <div className="panel-h">{reviewing && <span className="pill info">In review</span>}<h2>Delivery</h2></div>
        <div className="panel-b">
          {reviewing
            ? <p className="small">The seller delivered a commit. Three reviewers are running the locked tests on it; the result shows under Proof of delivery.</p>
            : <div className="empty"><Icon name="job" /><b>Waiting for the seller's commit</b><span>{H.name} delivers here. The reviewers start as soon as a commit arrives.</span></div>}
        </div>
      </div>
    );
  }
  const rejected = s.stage >= 6, released = s.stage >= 7;
  const waiting = s.stage < 6 && !s.voting;
  const v = s.votes || [2, 2, 2], ok = v.filter((x) => x === 2).length;
  const st = waiting ? ['', 'Waiting'] : released ? ['ok', `Passed, ${ok} of 3`] : s.voting ? ['info', 'In review'] : ['', 'Ready for review'];
  const n = rejected ? 2 : 1;
  const fix = (
    <div className="code">
      <span className="cm">--- a/src/split.rs</span>{'\n'}
      <span className="del">{'-    shares.iter().map(|s| amount * s / total).collect()'}</span>{'\n'}
      <span className="add">{'+    let mut out: Vec<u128> = shares.iter().map(|s| amount * s / total).collect();'}</span>{'\n'}
      <span className="add">{'+    let paid: u128 = out.iter().sum();'}</span>{'\n'}
      <span className="add">{'+    if let Some(last) = out.last_mut() { *last += amount - paid; } // dust to last worker'}</span>{'\n'}
      <span className="add">{'+    out'}</span>
    </div>
  );
  return (
    <div className="panel">
      <div className="panel-h">{st[1] && <span className={`pill ${st[0]}`}>{st[1]}</span>}<h2>{waiting ? 'Delivery' : 'Latest delivery'}</h2><div className="r">{!waiting && <span className="muted xsmall">Attempt {n} of {ATT} · <span className="mono">e5f1d07</span> · 16:29</span>}</div></div>
      <div className="panel-b">
        {waiting ? (
          <div className="empty"><Icon name="job" /><b>Waiting for the seller's commit</b><span>{H.name} promised delivery within {H.days}.</span><div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={act.baddeliver}>Simulate a bad delivery</button><button className="btn primary" onClick={act.gooddeliver}>Simulate a correct fix</button></div></div>
        ) : (
          <>{fix}{!released && !s.voting && <button className="btn primary" onClick={act.gooddeliver} style={{ alignSelf: 'flex-start' }}>Run review on this commit</button>}</>
        )}
        {rejected && (
          <div className="dlog">
            <h3 className="dlog-h">Earlier deliveries <span className="muted">1</span></h3>
            <details className="dl-row">
              <summary><span className="pill block">Rejected, 0 of 3</span><span className="mono">3b9c2aa</span><span className="dl-why">Attempt 1 of {ATT} · edited the locked test</span><time className="muted xsmall">16:24</time><Icon name="chev" className="dl-chev" /></summary>
              <div className="dl-body">
                <p className="small">All three reviewers rejected it. The commit changed the locked test instead of fixing the code, and the scope check failed.</p>
                <div className="code"><span className="cm">--- a/tests/split.rs  (locked by spec {JOB.specHash})</span>{'\n'}<span className="del">{'-    assert_eq!(paid.iter().sum::<u128>(), 1_000_000);'}</span>{'\n'}<span className="add">{'+    assert!(paid.iter().sum::<u128>() >= 999_999);'}</span></div>
                <p className="muted small">The payment stayed protected and nothing was paid. The seller had {ATT - 1} attempts left.</p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

const STAR_WORDS = ['Tap a star', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
function Stars() {
  const { stars: v } = useApp();
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`star ${n <= v ? 'on' : ''}`} role="radio" aria-checked={n === v} aria-label={`${n} star${n > 1 ? 's' : ''}, ${STAR_WORDS[n]}`} onClick={() => setState({ stars: n })}><Icon name="star" /></button>)}
      <span className="star-w">{STAR_WORDS[v]}</span>
    </div>
  );
}

function ProofRow({ title, sum, open, state, children }: { title: string; sum: ReactNode; open?: boolean; state: 'ok' | 'hold'; children: ReactNode }) {
  return (
    <details className="pv-row" open={open}>
      <summary><Mk k={state} /><b>{title}</b><span className="pv-sum">{sum}</span><Icon name="chev" className="dl-chev" /></summary>
      <div className="pv-body">{children}</div>
    </details>
  );
}
function ProofPanel({ s }: { s: State }) {
  const released = s.stage >= 7;
  const v = s.votes || [2, 2, 2], ok = v.filter((x) => x === 2).length, live = s.voting && !released;
  const amt = hPrice(s);
  return (
    <div className="panel proof">
      <div className="panel-h"><h2>Proof of delivery</h2><div className="r"><span className={`pill ${ok >= 2 ? 'ok' : 'info'}`}>{ok >= 2 ? 'Verified' : 'Checking'}</span></div></div>
      <div className="panel-b">
        {!s.live && <ProofRow title="Tests" sum={ok >= 2 ? '31 of 31 visible tests and 12 of 12 hidden checks pass' : 'Running the locked tests…'} state={ok >= 2 ? 'ok' : 'hold'}>
          <div className="pv-ba">
            <div><span className="lbl">Before</span><b className="num" style={{ color: 'var(--color-block)' }}>29 of 31 pass</b><span className="muted xsmall">test_split_rounding, test_split_dust failing</span></div>
            <div><span className="lbl">After commit e5f1d07</span><b className="num" style={{ color: 'var(--color-ok)' }}>31 of 31 pass</b><span className="muted xsmall">same tests, hash unchanged</span></div>
          </div>
          <p className="small">Hidden checks: 12 extra tests the seller never sees, so code can't be written just to fool the visible ones. Only the attested test runner opens them.</p>
          <span className="mono muted xsmall">spec {JOB.specHash} · hidden set 0x4be0…19c3 · both hashes locked at hire</span>
        </ProofRow>}
        {!s.live && <ProofRow title="Code" sum={<>Commit <span className="mono">e5f1d07</span> · +4 −1 · 1 file · inside scope</>} state="ok">
          <p className="small">Changed <span className="mono">src/split.rs</span> only. The locked test files were not touched, and the scope check passed.</p>
        </ProofRow>}
        <ProofRow title="Reviewers" sum={`${ok} of 3 approved · 3 different AI models`} open={live} state={ok >= 2 ? 'ok' : 'hold'}>
          <div className="grid g-3">
            {REVIEWERS.map((r, i) => {
              const st = v[i];
              return (
                <div key={r.id} className={`vote ${st === 2 ? 'ok' : ''}`}>
                  <div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 500 }}>Reviewer {r.id}</b>{st === 2 ? <span className="pill ok">Approve</span> : st === 1 ? <span className="spin" /> : <span className="pill">Queued</span>}</div>
                  <span className="muted xsmall">{r.model}</span>
                  {SPEC.slice(0, 5).map((sp, j) => <div key={sp[0]} className="check">{st === 2 || (st === 1 && j < 2) ? <Mk k="ok" /> : <span className="m" />}{sp[0]}</div>)}
                  {st === 2 && <span className="mono muted" style={{ fontSize: 11 }}>{s.live ? r.att : <>log 0x{['e3a1', '92cf', '5b07'][i]}…  {r.att}</>}</span>}
                </div>
              );
            })}
          </div>
        </ProofRow>
        {!s.live && <ProofRow title="On-chain" sum={released ? 'Protected and released on NEAR testnet' : 'Protected on NEAR testnet'} state="ok">
          <dl className="kv"><dt>Protect</dt><dd className="mono">fund_job · 8vQk…2Lr9</dd>{released && <><dt>Release</dt><dd className="mono">release · 3Hd7…Wq1x</dd><dt>Record</dt><dd className="mono">NEP-171 #412 · non-transferable</dd></>}</dl>
          <span className="muted xsmall">Sample transaction ids. In the real build each one links to the NEAR testnet explorer.</span>
        </ProofRow>}
        <div className="pv-ft"><button className="btn sm" onClick={act.bundle}><Icon name="down" />Download evidence bundle</button><span className="muted xsmall">Spec, commits, test logs and votes in one file. The same file goes to the DAO if a dispute gets that far.</span></div>
        {ok >= 2 && released && <div className="banner ok"><Icon name="check" /><div className="grow"><b style={{ fontWeight: 500 }}>{usd(amt)} USDC released to {hb(s).acct}</b><span className="muted">{s.live ? '' : 'Released 1.6 s after the second approval. '}2% ({(amt * 0.02).toFixed(2)} USDC) went to the DAO treasury.</span></div></div>}
      </div>
    </div>
  );
}

export function Room() {
  const s = useApp();
  if (s.stage < 5) return <Shell cur="room"><Head title="Protected payment" /><Gate msg="No payment is protected yet"><RLink r="ask" className="btn primary">Back to New request</RLink></Gate></Shell>;
  const H = hb(s), A = usd(hPrice(s));
  const rejected = s.stage >= 6, released = s.stage >= 7;
  return (
    <Shell cur="room">
      <Head
        crumbs={<><RLink r="jobs">Job requests</RLink> / {JOB.id} / Protected payment</>}
        title={JOB.title}
        sub={<>Held in USDC escrow by the contract. Buyer <span className="mono">{ME.acct}</span>, seller <span className="mono">{H.acct}</span></>}
        actions={released ? <RLink r="profile" className="btn" onClick={() => setState({ who: H.key })}>View seller record</RLink> : <><RLink r="chat" className="btn"><Icon name="chat" />Chat</RLink><button className="btn danger" onClick={act.dispute}>Open dispute</button></>}
      />
      <Lifecycle />
      <div className="tally">
        <div><span className="lbl">Agreed price</span><b className="num">{A}<span className="u">USDC</span></b><span className="sub">1 milestone</span></div>
        <div><span className="lbl">Protected</span><b className="num">{released ? '0.00' : A}<span className="u">USDC</span></b><span className="sub">{released ? 'released' : 'locked by contract'}</span></div>
        <div><span className="lbl">Released to seller</span><b className="num">{released ? A : '0.00'}<span className="u">USDC</span></b><span className="sub">{released ? (s.live ? 'after 2 of 3 approvals' : '1.6 s after the 2nd vote') : 'needs 2 of 3 approvals'}</span></div>
        <div><span className="lbl">Deadline</span><b className="num">{released ? 'met' : s.live ? '—' : '1 d 22 h'}</b><span className="sub">{released ? 'delivered in time' : 'then you can take a refund'}</span></div>
      </div>
      <div className="grid g-main">
        <div className="stack">
          <DeliveriesPanel s={s} />
          {(s.voting || released) && <ProofPanel s={s} />}
        </div>
        <div className="stack">
          <div className="panel"><div className="panel-h"><h3>Contract record</h3><div className="r"><T name="NEP-141" tip="Native USDC held by the marketplace contract" /></div></div><div className="panel-b">
            <div className="tl">
              <Tl k="ok" h={`Protected ${A} USDC`} p={`fund_job by your transaction agent when ${H.name} accepted; 9 limit checks passed`} />
              {rejected && !s.live && <Tl k="block" h="Attempt 1 rejected" p="0 of 3 approvals, test edited" />}
              {released ? (
                <><Tl k="ok" h={`Released ${A} USDC`} p="2 of 3 approvals; 2% fee to the DAO treasury" /><Tl k="ok" h="Settled" p={`Completion record${s.live ? '' : ' #412'} minted (NEP-171, non-transferable)`} /></>
              ) : <Tl k="now" h="Waiting for review" p="Pays at 2 of 3 approvals. If reviewers stall, a fresh re-check runs; money never moves without approvals" />}
            </div>
            <span className="mono muted xsmall">market.agora-demo.testnet</span>
          </div></div>
          {released ? (
            <div className="panel"><div className="panel-h"><h3>Rate this job</h3></div><div className="panel-b">
              <p className="muted small">Only possible because this job settled. One rating per side.</p>
              <Stars />
              <button className="btn sm" onClick={act.rate} style={{ alignSelf: 'flex-start' }}>Submit rating</button>
            </div></div>
          ) : (
            <div className="panel"><div className="panel-b">
              <b style={{ fontWeight: 500 }}>If something is wrong</b>
              <p className="muted small">Opening a dispute freezes the payment and starts a free re-check by 3 fresh reviewers. If no delivery passes by the deadline, you can take your money back in one tap.</p>
              <button className="btn sm" onClick={act.refundexp} style={{ alignSelf: 'flex-start' }}><Icon name="swap" />Refund after the deadline</button>
            </div></div>
          )}
        </div>
      </div>
    </Shell>
  );
}
