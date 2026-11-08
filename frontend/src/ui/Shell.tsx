import type { ReactNode } from 'react';
import { ME, OTHER_JOBS, usd } from '../data/sample';
import { liveReadNotes } from '../lib/live';
import { act } from '../store/actions';
import { escrow, free, hb, hPrice, paused, useApp } from '../store/store';
import { Icon, Logo, type IconName } from './icons';
import { Pop, RLink, usePop } from './parts';

function NavItem({ r, label, icon, cur, count }: { r: string; label: string; icon: IconName; cur: string; count?: string }) {
  const on = cur === r;
  return (
    <RLink r={r} className={on ? 'on' : ''} {...(on ? { 'aria-current': 'page' } : {})}>
      <Icon name={icon} /><span className="t">{label}</span>{count && <span className="count">{count}</span>}
    </RLink>
  );
}

function MeMenu({ close, cur }: { close: () => void; cur: string }) {
  const s = useApp();
  return (
    <>
      <div className="who">
        <b>{s.user?.name || ME.name}</b><span className="muted small">{s.user?.email || ME.acct}</span>
        <span className="small"><b className="num">{usd(free(s))} USDC</b> <span className="muted">{escrow(s) ? usd(escrow(s)) + ' protected' : 'available'}</span></span>
      </div>
      <hr />
      <RLink r="ask" className="mi" role="menuitem" onClick={close}><Icon name="spark" />Start a request</RLink>
      <RLink r="jobs" className="mi" role="menuitem" onClick={close}><Icon name="brief" />Job requests</RLink>
      <RLink r="chat" className="mi" role="menuitem" onClick={close}><Icon name="chat" />Messages{s.stage >= 4 && <span className="aside">1 open</span>}</RLink>
      <hr />
      <RLink r="sell" className="mi" role="menuitem" onClick={close}><Icon name="store" />{s.seller ? 'Edit seller profile' : 'Become a seller'}</RLink>
      <RLink r="wallet" className="mi" role="menuitem" onClick={close}><Icon name="wallet" />Wallet<span className="aside num">{usd(free(s) + escrow(s))} USDC</span></RLink>
      <RLink r="mandate" className="mi" role="menuitem" onClick={close}><Icon name="mandate" />Limits and keys</RLink>
      <hr />
      <button className="mi hl" role="menuitem" onClick={() => { close(); act.mode(s.mode === 'sell' ? 'buy' : 'sell', cur); }}><Icon name="swap" />Switch to {s.mode === 'sell' ? 'buying' : 'selling'}</button>
      <button className="mi" role="menuitem" onClick={() => { close(); act.rolepick(); }}><Icon name="swap" />Change what brings you here</button>
      <hr />
      <button className="mi" role="menuitem" onClick={() => { close(); act.theme(); }}><Icon name="sun" />Light or dark</button>
      <button className="mi" role="menuitem" onClick={() => { close(); act.signout(); }}><Icon name="out" />Sign out</button>
    </>
  );
}

function NoteMenu({ close }: { close: () => void }) {
  const s = useApp(); const { stage } = s;
  const n: [IconName, string, string, string, string][] = [];
  if (s.live) s.notes.items.forEach((x) => n.push([x.kind === 'held' ? 'warn' : x.kind === 'message' ? 'chat' : 'check', x.kind === 'held' ? 'hold' : x.read ? '' : 'ok', x.text, x.time, (x.link ?? '/dash').replace(/^\//, '').split('?')[0] || 'dash']));
  if (!s.live) {
    if (stage >= 7) n.push(['check', 'ok', usd(hPrice(s)) + ' USDC released to ' + hb(s).name, 'Reviewers approved commit e5f1d07', 'room']);
    if (stage >= 6) n.push(['x', 'block', 'A delivery was rejected', 'Commit 3b9c2aa edited a locked test', 'room']);
    if (stage >= 5) n.push(['chat', '', hb(s).name + ' accepted your offer', 'The payment is protected. Work has started.', 'chat']);
    if (stage >= 3) n.push(['warn', 'hold', '2 offers held for review', 'An off-platform request and a 2 USDC offer', 'ask']);
    if (stage >= 1) n.push(['gift', '', 'Welcome to AGORA', '120.00 test USDC is in your wallet', 'wallet']);
  }
  return (
    <>
      <div className="ph">Notifications</div>
      {n.length ? n.map((x) => (
        <RLink key={x[2]} r={x[4]} className="mi note" role="menuitem" onClick={close}>
          <Icon name={x[0]} className={x[1]} /><span><b>{x[2]}</b><span className="muted xsmall">{x[3]}</span></span>
        </RLink>
      )) : <p className="muted small" style={{ padding: '8px 12px' }}>Nothing yet.</p>}
    </>
  );
}

/** The signed-in app frame: folding sidebar, paused band and top bar. */
export function Shell({ cur, children }: { cur: string; children: ReactNode }) {
  const s = useApp();
  const signed = s.stage >= 1;
  const isPaused = paused(s);
  const [meOpen, meRef, meToggle, meClose] = usePop();
  const [noteOpen, noteRef, noteToggle, noteClose] = usePop();
  const jobsCount = (s.stage >= 2 ? 1 : 0) + s.newJobs.length + (s.stage >= 1 ? OTHER_JOBS.length : 0);

  return (
    <div className={`shell ${s.fold ? 'folded' : ''}`}>
      {/* A mouse click leaves focus inside the sidebar, and :focus-within would keep a folded sidebar open.
          The prototype re-rendered on every click, which dropped focus; drop it here too. Keyboard focus stays. */}
      <aside className="side night" onClick={(e) => { if (e.detail > 0) (document.activeElement as HTMLElement | null)?.blur(); }}>
        <div className="brand-row">
          <RLink r="home" className="brand" aria-label="AGORA home"><span className="brand-mark"><Logo /></span><span className="brand-name">AGORA</span></RLink>
          <button className="fold" onClick={act.fold} aria-label={s.fold ? 'Keep the sidebar open' : 'Collapse sidebar'} aria-pressed={s.fold}><Icon name={s.fold ? 'unfold' : 'fold'} /></button>
        </div>
        {signed && (
          <div className="mode" role="group" aria-label="Switch between buying and selling">
            <button className={s.mode !== 'sell' ? 'on' : ''} onClick={() => act.mode('buy', cur)} aria-pressed={s.mode !== 'sell'}><Icon name="brief" /><span className="t">Buying</span></button>
            <button className={s.mode === 'sell' ? 'on' : ''} onClick={() => act.mode('sell', cur)} aria-pressed={s.mode === 'sell'}><Icon name="store" /><span className="t">Selling</span></button>
          </div>
        )}
        <nav className="nav" aria-label="Main">
          {s.mode === 'sell' ? (
            <>
              <div className="nav-group">Sell</div>
              <NavItem r="seller" label="Seller dashboard" icon="home" cur={cur} />
              <NavItem r="orders" label="Orders" icon="job" cur={cur} count={String(s.orders.filter((o) => o.st < 4).length)} />
              <NavItem r="openjobs" label="Open jobs" icon="explore" cur={cur} />
              <div className="nav-group">Your agents</div>
              <NavItem r="agents" label="Bidding agent" icon="agents" cur={cur} />
              <NavItem r="mandate" label="Limits and keys" icon="mandate" cur={cur} />
              <NavItem r="wallet" label="Earnings" icon="wallet" cur={cur} />
              <div className="nav-group">Market</div>
              <NavItem r="chat" label="Messages" icon="chat" cur={cur} />
              <NavItem r="dispute" label="Disputes" icon="dao" cur={cur} />
            </>
          ) : (
            <>
              <div className="nav-group">Hire</div>
              <NavItem r="ask" label="New request" icon="spark" cur={cur === 'post' ? 'ask' : cur} />
              <NavItem r="dash" label="Overview" icon="home" cur={cur} />
              <NavItem r="explore" label="Find services" icon="explore" cur={cur === 'profile' ? 'explore' : cur} />
              <NavItem r="jobs" label="Job requests" icon="job" cur={cur === 'job' ? 'jobs' : cur} count={jobsCount ? String(jobsCount) : ''} />
              <NavItem r="room" label="Protected payment" icon="room" cur={cur} count={s.stage >= 5 && s.stage < 7 ? 'live' : ''} />
              <div className="nav-group">Your agents</div>
              <NavItem r="agents" label="Agent team" icon="agents" cur={cur} count={isPaused ? 'paused' : ''} />
              <NavItem r="mandate" label="Limits and keys" icon="mandate" cur={cur} />
              <NavItem r="wallet" label="Wallet" icon="wallet" cur={cur} />
              <div className="nav-group">Market</div>
              <NavItem r="dispute" label="Disputes" icon="dao" cur={cur} />
            </>
          )}
        </nav>
        <div className="side-foot">
          <div className={`guard ${isPaused ? 'paused' : ''}`}>
            <b><Icon name={isPaused ? 'pause' : 'shield'} /><span className="t">{isPaused ? 'Agents paused' : 'Guardian watching'}</span></b>
            <span className="gd">{isPaused ? 'Only your full-access key can unpause.' : 'Pauses your agents if something probes your limits.'}</span>
          </div>
          <span className="muted xsmall gd">Prototype with sample data on NEAR testnet</span>
        </div>
      </aside>
      <div className="main">
        {isPaused && (
          <div className="paused-band">
            <Icon name="pause" /><b>Guardian paused your agents.</b><span>Every funding and release call is stopped until you unpause.</span>
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => act.unpause()}>Review and unpause</button>
          </div>
        )}
        <header className="top">
          <span className="net" title="All money in this prototype is testnet USDC">Testnet</span>
          <button className="btn sm ghost" onClick={act.tour}><Icon name="play" /><span>Play demo</span></button>
          <div className="top-right">
            {signed ? (
              <>
                <button ref={noteRef} className="btn icon ghost dot-host" onClick={() => { noteToggle(); if (s.live) void liveReadNotes(); }} aria-label="Notifications" aria-haspopup="menu" aria-expanded={noteOpen}>
                  <Icon name="bell" />{(s.live ? s.notes.unread > 0 : s.stage >= 3) && <i className="dot" />}
                </button>
                <RLink r="chat" className="btn icon ghost dot-host" aria-label="Messages"><Icon name="mail" />{s.stage >= 4 && s.stage < 5 && <i className="dot" />}</RLink>
                <RLink r="saved" className="btn icon ghost dot-host" aria-label={`Saved, ${s.liked.length}`}><Icon name="heart" />{s.liked.length > 0 && <i className="num-dot">{s.liked.length}</i>}</RLink>
                <RLink r={s.mode === 'sell' ? 'orders' : 'jobs'} className="btn sm ghost orders">{s.mode === 'sell' ? 'Orders' : 'Job requests'}</RLink>
                <button ref={meRef} className="me-btn" onClick={meToggle} aria-label="Account menu" aria-haspopup="menu" aria-expanded={meOpen}>
                  <span className="avatar">{ME.initials}</span><i className="online" aria-hidden="true" />
                </button>
              </>
            ) : <button className="btn primary sm" onClick={act.signin}>Sign in</button>}
          </div>
        </header>
        <main className="content" id="content">{children}</main>
      </div>
      {meOpen && <Pop anchor={meRef} onClose={meClose}><MeMenu close={meClose} cur={cur} /></Pop>}
      {noteOpen && <Pop anchor={noteRef} onClose={noteClose} wide><NoteMenu close={noteClose} /></Pop>}
    </div>
  );
}
