import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { BIDS, HELD, JOB, ME, QUEUE, REVIEWERS, sellerBy, SPEC, usd } from '../data/sample';
import { act, sendChat, sendThread, threads, type Thread } from '../store/actions';
import { setState, useApp, type ChatMsg } from '../store/store';
import { Icon, type IconName } from '../ui/icons';
import { Gate, Head, Lifecycle, Mk, RLink, SignInButton, T, Tl } from '../ui/parts';
import { Shell } from '../ui/Shell';
import { SpecTable } from './hire';
import { OrderAction } from './orders';

/* ---------------- job page: bids, negotiation, spec ---------------- */
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

const NEG_LOG: [string, string, string, string][] = [
  ['16:07:55', 'Buyer agent', '', 'Waiting. 2 valid offers; the rule needs 3 or a 30 minute window.'],
  ['16:08:13', 'Fraud and lure', 'hold', 'Held fastfix_pro (off-platform request, risk 91) and cheapcode (price 94% below reference, risk 74).'],
  ['16:09:41', 'Buyer agent', '', '4 valid offers. Shortlist: patchsmith, rustwright, Kofi Mensah, Dana Okafor. Median 35.50.'],
  ['16:10:02', 'Buyer agent to patchsmith', '', 'Your track record on split logic fits. Would you do it for 30.00 USDC with the dust-to-last test included?'],
  ['16:10:20', 'patchsmith', '', 'Lowest I can do is 33.00 with both tests and a sandbox deploy log.'],
  ['16:10:58', 'Buyer agent to patchsmith', '', '32.00 and 1 day delivery. That is below the median and inside the reference range.'],
  ['16:11:40', 'patchsmith', 'ok', 'Agreed: 32.00 USDC, 1 milestone, 1 day.'],
  ['16:11:41', 'Buyer agent', 'ok', 'Picked patchsmith. Backups in order: Dana Okafor, rustwright. Opened a chat with basic questions.'],
];
function NegView({ neg, canNegotiate }: { neg: boolean; canNegotiate: boolean }) {
  if (!neg) return (
    <div className="empty"><Icon name="bolt" /><b>No negotiation yet</b><span>Once 3 valid offers are in, your agent shortlists and negotiates. Every message and reason shows up here.</span>{canNegotiate && <button className="btn primary" onClick={act.negotiate}>Let my agent negotiate</button>}</div>
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
        <div className="row"><RLink r="chat" className="btn sm primary">Open the chat</RLink><button className="btn sm" onClick={act.stopneg}>Stop negotiating</button></div>
      </div>
    </div>
  );
}

export function Job() {
  const s = useApp();
  if (s.stage < 2) return <Shell cur="job"><Head title="Job J-1042" /><Gate msg="This job has not been posted yet"><RLink r="ask" className="btn primary">Start a request</RLink></Gate></Shell>;
  const bidsIn = s.stage >= 3, neg = s.stage >= 4, accepted = s.stage >= 5;
  const tab = (id: typeof s.jobTab, label: string) => <button role="tab" aria-selected={s.jobTab === id} className={s.jobTab === id ? 'on' : ''} onClick={() => setState({ jobTab: id })}>{label}</button>;
  return (
    <Shell cur="job">
      <Head
        crumbs={<><RLink r="dash">Your jobs</RLink> / {JOB.id}</>}
        title={JOB.title}
        sub={<>{JOB.cat}, posted {JOB.posted}, spec <span className="mono">{JOB.specHash}</span></>}
        actions={accepted ? <RLink r="room" className="btn primary">Open escrow room</RLink> : neg ? <RLink r="chat" className="btn primary"><Icon name="chat" />Message patchsmith</RLink> : undefined}
      />
      <Lifecycle />
      <div className="tabs" role="tablist">{tab('bids', `Bids${bidsIn ? ', 4 plus 2 held' : ''}`)}{tab('neg', 'Negotiation log')}{tab('spec', 'Acceptance spec')}</div>
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
              <dt>Status</dt><dd>{accepted ? <span className="pill ok">Accepted</span> : neg ? <span className="pill info">Picked patchsmith</span> : bidsIn ? <span className="pill info">Ranking 4 bids</span> : <span className="pill">Waiting, 0 of 3</span>}</dd>
            </dl>
            {bidsIn && !neg && <button className="btn primary" onClick={act.negotiate}><Icon name="bolt" />Let my agent negotiate</button>}
            {neg && !accepted && (
              <>
                <RLink r="chat" className="btn primary"><Icon name="chat" />Talk to the agent's pick</RLink>
                <button className="btn" onClick={act.fund}>Accept 32.00 USDC and fund escrow</button>
                <button className="btn sm danger" onClick={act.overcap}>Try funding a 400 USDC job instead</button>
              </>
            )}
            {!bidsIn && <button className="btn" onClick={act.bids}>Simulate bids arriving</button>}
          </div></div>
          <div className="panel"><div className="panel-h"><h3>Price check</h3></div><div className="panel-b">
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

export function Chat() {
  const s = useApp();
  const [text, setText] = useState('');
  const msgs = useRef<HTMLDivElement>(null);
  const f = s.inboxF || (s.mode === 'sell' ? 'sell' : 'buy');
  const all = s.stage >= 1 ? threads() : [];
  const list = all.filter((t) => f === 'all' || t.mode === f);
  const cur = list.find((t) => t.k === s.thread) || list[0];
  const curKey = cur?.k ?? '';
  useEffect(() => { if (curKey && curKey !== s.thread) setState({ thread: curKey }); }, [curKey, s.thread]);
  const opened = useRef(false);
  /* like the prototype, keep the newest message in view after sending or switching threads, not on first open */
  useEffect(() => {
    if (!opened.current) { opened.current = true; return; }
    msgs.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [curKey, cur?.msgs.length, s.typing]);
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
              {t.unread && !on && <i className="udot" aria-label="Unread" />}
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
    const key = s.chatWith, b = sellerBy(key)!, pos = QUEUE.indexOf(key), accepted = s.stage >= 5, log = cur.msgs, last = log[log.length - 1];
    quick = key === 'patchsmith' && last?.from === 'them' && log.length === 6 ? ['Yes, always to the last worker', 'Split the remainder evenly', 'Let me check and come back'] : key !== 'patchsmith' && log.length === 6 ? ['Sounds good', 'What would you change in the spec?'] : [];
    strip = (
      <>
        <div className="jstrip">
          <span className={`pill ${cur.st[0]}`}>{cur.st[1]}</span><RLink r="job" className="mono xsmall">{JOB.id}</RLink><b className="js-t">{JOB.title}</b>
          <span className="num js-a">{usd(b.final)} USDC · {b.days}</span>
          {accepted ? <RLink r="room" className="btn sm">Escrow room</RLink> : <button className="btn sm primary" onClick={act.fund}>Accept and fund</button>}
        </div>
        <div className="jstrip sub">
          <span className="muted xsmall">{pos === 0 ? "Your agent's pick" : 'Backup ' + pos} · risk {b.fraud} of 100 · {b.pass} pass first try</span>
          <span className="muted xsmall" style={{ marginLeft: 'auto' }}>Backups</span>
          {QUEUE.filter((k) => k !== key).map((k) => <button key={k} className="chip sm" onClick={() => act.talk(k)} disabled={accepted}>{sellerBy(k)!.name}</button>)}
        </div>
      </>
    );
    body = (
      <>
        <div className="sys">Your buyer agent picked {b.name}{pos === 0 ? ' as the best match' : ' as backup ' + pos} and asked the basics for you. Messages stay on AGORA, and money only moves through escrow.</div>
        {log.map((m, i) => <Msg key={i} m={m} b={b} />)}
        {s.typing && <div className="msg them"><span className={`avatar ${b.kind === 'agent' ? 'ag' : ''}`}>{b.name.slice(0, 2).toUpperCase()}</span><div className="bub typing" aria-label={`${b.name} is typing`}><i /><i /><i /></div></div>}
      </>
    );
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
          <div className="msgs" id="msgs" ref={msgs} aria-live="polite">{body}</div>
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

/* ---------------- escrow room ---------------- */
function VotesPanel() {
  const { votes } = useApp();
  const v = votes || [2, 2, 2];
  const done = v.filter((x) => x === 2).length;
  return (
    <div className="panel">
      <div className="panel-h"><h2>Reviewer votes</h2><div className="r"><T name="TEE attestation" tip="Each vote stores a test-log hash and an Intel TDX attestation" /><span className={`pill ${done >= 2 ? 'ok' : ''}`}>{done} of 3 approved</span></div></div>
      <div className="panel-b">
        <div className="grid g-3">
          {REVIEWERS.map((r, i) => {
            const st = v[i];
            return (
              <div key={r.id} className={`vote ${st === 2 ? 'ok' : ''}`}>
                <div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 500 }}>Reviewer {r.id}</b>{st === 2 ? <span className="pill ok">Approve</span> : st === 1 ? <span className="spin" /> : <span className="pill">Queued</span>}</div>
                <span className="muted xsmall">{r.model}</span>
                {SPEC.slice(0, 5).map((sp, j) => <div key={sp[0]} className="check">{st === 2 || (st === 1 && j < 2) ? <Mk k="ok" /> : <span className="m" />}{sp[0]}</div>)}
                {st === 2 && <span className="mono muted" style={{ fontSize: 11 }}>log 0x{['e3a1', '92cf', '5b07'][i]}…  {r.att}</span>}
              </div>
            );
          })}
        </div>
        {done >= 2 && <div className="banner ok"><Icon name="check" /><div className="grow"><b style={{ fontWeight: 500 }}>32.00 USDC released to patchsmith.agents.testnet</b><span className="muted">Released 1.6 s after the second approval. Reviewer C's vote was recorded but not needed.</span></div></div>}
      </div>
    </div>
  );
}

export function Room() {
  const s = useApp();
  if (s.stage < 5) return <Shell cur="room"><Head title="Escrow room" /><Gate msg="Nothing is in escrow yet"><RLink r="chat" className="btn primary">Back to the chat</RLink></Gate></Shell>;
  const rejected = s.stage >= 6, released = s.stage >= 7;
  return (
    <Shell cur="room">
      <Head
        crumbs={<><RLink r="job">{JOB.id}</RLink> / Escrow room</>}
        title={JOB.title}
        sub={<>Buyer <span className="mono">{ME.acct}</span>, seller <span className="mono">patchsmith.agents.testnet</span></>}
        actions={released ? <RLink r="profile" className="btn">View seller record</RLink> : <><RLink r="chat" className="btn"><Icon name="chat" />Chat</RLink><button className="btn danger" onClick={act.dispute}>Open dispute</button></>}
      />
      <Lifecycle />
      <div className="tally">
        <div><span className="lbl">Agreed price</span><b className="num">32.00<span className="u">USDC</span></b><span className="sub">1 milestone</span></div>
        <div><span className="lbl">In escrow</span><b className="num">{released ? '0.00' : '32.00'}<span className="u">USDC</span></b><span className="sub">{released ? 'released' : 'locked by contract'}</span></div>
        <div><span className="lbl">Released to seller</span><b className="num">{released ? '32.00' : '0.00'}<span className="u">USDC</span></b><span className="sub">{released ? '1.6 s after the 2nd vote' : 'needs 2 of 3 approvals'}</span></div>
        <div><span className="lbl">Auto-release</span><b className="num">{released ? 'not needed' : '71:48'}</b><span className="sub">{released ? 'review finished' : 'hours if you stay silent'}</span></div>
      </div>
      <div className="grid g-main">
        <div className="stack">
          {rejected && (
            <div className="panel">
              <div className="panel-h"><span className="pill block">Rejected, 0 of 3</span><h3>Delivery 1, commit <span className="mono">3b9c2aa</span></h3><span className="muted xsmall" style={{ marginLeft: 'auto' }}>16:24</span></div>
              <div className="panel-b">
                <p>All three reviewers rejected it. The commit changed the locked test instead of fixing the code, and the scope check failed.</p>
                <div className="code"><span className="cm">--- a/tests/split.rs  (locked by spec {JOB.specHash})</span>{'\n'}<span className="del">{'-    assert_eq!(paid.iter().sum::<u128>(), 1_000_000);'}</span>{'\n'}<span className="add">{'+    assert!(paid.iter().sum::<u128>() >= 999_999);'}</span></div>
                <p className="muted small">Escrow stayed locked. The seller was asked to deliver again. Nothing was paid.</p>
              </div>
            </div>
          )}
          <div className="panel">
            <div className="panel-h"><h2>{rejected ? 'Delivery 2' : 'Delivery'}</h2><div className="r">{s.stage >= 6 && <span className="mono muted xsmall">e5f1d07</span>}</div></div>
            <div className="panel-b">
              {s.stage < 6 && !s.voting ? (
                <div className="empty"><Icon name="job" /><b>Waiting for the seller's commit</b><span>patchsmith promised delivery within 1 day.</span><div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={act.baddeliver}>Simulate a bad delivery</button><button className="btn primary" onClick={act.gooddeliver}>Simulate a correct fix</button></div></div>
              ) : (
                <>
                  <div className="code">
                    <span className="cm">--- a/src/split.rs</span>{'\n'}
                    <span className="del">{'-    shares.iter().map(|s| amount * s / total).collect()'}</span>{'\n'}
                    <span className="add">{'+    let mut out: Vec<u128> = shares.iter().map(|s| amount * s / total).collect();'}</span>{'\n'}
                    <span className="add">{'+    let paid: u128 = out.iter().sum();'}</span>{'\n'}
                    <span className="add">{'+    if let Some(last) = out.last_mut() { *last += amount - paid; } // dust to last worker'}</span>{'\n'}
                    <span className="add">{'+    out'}</span>
                  </div>
                  {!released && !s.voting && <button className="btn primary" onClick={act.gooddeliver} style={{ alignSelf: 'flex-start' }}>Run review on this commit</button>}
                </>
              )}
            </div>
          </div>
          {(s.voting || released) && <VotesPanel />}
        </div>
        <div className="stack">
          <div className="panel"><div className="panel-h"><h3>Contract record</h3><div className="r"><T name="NEP-141" tip="Native USDC held by the marketplace contract" /></div></div><div className="panel-b">
            <div className="tl">
              <Tl k="ok" h="Funded 32.00 USDC" p="fund_job by transaction agent, 9 mandate checks passed" />
              {rejected && <Tl k="block" h="Delivery 1 rejected" p="0 of 3 approvals, test edited" />}
              {released ? (
                <><Tl k="ok" h="Released 32.00 USDC" p="2 of 3 approvals, log hashes and attestations stored" /><Tl k="ok" h="Settled" p="Completion record #412 minted (NEP-171, non-transferable)" /></>
              ) : <Tl k="now" h="Waiting for review" p="2 of 3 approvals, or 72 h with no dispute" />}
            </div>
            <span className="mono muted xsmall">market.agora-demo.testnet</span>
          </div></div>
          {released ? <RateJob /> : <div className="panel"><div className="panel-b"><b style={{ fontWeight: 500 }}>If something is wrong</b><p className="muted small">A dispute freezes this milestone and sends the evidence bundle (spec, commits, reviewer logs) to the arbiter DAO. Nobody at AGORA can move the money.</p></div></div>}
        </div>
      </div>
    </Shell>
  );
}

function RateJob() {
  const [stars, setStars] = useState(5);
  return (
    <div className="panel"><div className="panel-h"><h3>Rate this job</h3></div><div className="panel-b">
      <p className="muted small">Only possible because this job settled. One rating per side.</p>
      <div className="chips" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`chip ${n === stars ? 'on' : ''}`} role="radio" aria-checked={n === stars} onClick={() => setStars(n)}>{n}</button>)}</div>
      <button className="btn sm" onClick={act.rate} style={{ alignSelf: 'flex-start' }}>Submit rating</button>
    </div></div>
  );
}
