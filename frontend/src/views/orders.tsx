import { O_ST, usd, type Order } from '../data/sample';
import { orderAct } from '../store/actions';
import { setState, useApp, type State } from '../store/store';
import { Icon } from '../ui/icons';
import { Gate, Head, RLink, SignInButton } from '../ui/parts';
import { Shell } from '../ui/Shell';

/** The action buttons for an order at its current stage. Shared with the Messages job strip. */
export function OrderAction({ o, full = true }: { o: Order; full?: boolean }) {
  if (o.st === 0) return <><button className="btn sm primary" onClick={() => orderAct.offer(o.id)}>Send offer</button>{full && <button className="btn sm ghost" onClick={() => orderAct.decline(o.id)}>Decline</button>}</>;
  if (!full) return o.st === 2 ? <button className="btn sm primary" onClick={() => orderAct.deliver(o.id)}>Submit delivery</button> : <RLink r="orders" className="btn sm">View order</RLink>;
  if (o.st === 1) return <button className="btn sm ghost" onClick={() => orderAct.accept(o.id)} title="Prototype only: plays the buyer's side">Buyer accepts, demo</button>;
  if (o.st === 2) return <button className="btn sm primary" onClick={() => orderAct.deliver(o.id)}>Submit delivery</button>;
  if (o.st === 3) return <span className="muted xsmall">Payment releases at 2 of 3</span>;
  return <RLink r="wallet" className="btn sm ghost">Receipt</RLink>;
}

function OrderRow({ o }: { o: Order }) {
  const st = O_ST[o.st];
  return (
    <div className="orow">
      <div className="o-main">
        <div className="row"><span className={`pill ${st[0]}`}>{st[1]}</span><span className="mono muted xsmall">{o.id}</span><span className="muted xsmall">{o.buyer}</span></div>
        <h3>{o.title}</h3>
        <p className="muted small">{o.note}</p>
        <ol className="o-steps" aria-label={`Stage ${o.st + 1} of 5`}>
          {O_ST.map((x, i) => <li key={x[1]} className={i < o.st ? 'done' : i === o.st ? 'now' : ''}><span>{x[1]}</span></li>)}
        </ol>
      </div>
      <div className="o-side"><span className="amt num">{o.price}<span className="u">USDC</span></span><div className="row"><OrderAction o={o} /></div></div>
    </div>
  );
}

const sum = (list: Order[]) => list.reduce((n, o) => n + parseFloat(o.price), 0);

export function Orders() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="orders"><Head title="Orders" /><Gate msg="Sign in to see your orders"><SignInButton /></Gate></Shell>;
  const active = s.orders.filter((o) => o.st < 4), req = s.orders.filter((o) => o.st === 0), done = s.orders.filter((o) => o.st === 4);
  const list = s.oTab === 'req' ? req : s.oTab === 'done' ? done : active;
  const inEscrow = sum(s.orders.filter((o) => o.st === 2 || o.st === 3));
  const tabs: [State['oTab'], string, number][] = [['active', 'Active', active.length], ['req', 'Requests', req.length], ['done', 'Completed', done.length]];
  return (
    <Shell cur="orders">
      <Head title="Orders" sub="Jobs buyers hired you for. Escrow is funded before you start, and the locked tests decide when you get paid." actions={<RLink r="openjobs" className="btn"><Icon name="explore" />Find open jobs</RLink>} />
      {!s.seller && (
        <div className="banner"><Icon name="store" /><div className="grow"><b style={{ fontWeight: 500 }}>Sample orders</b><span className="muted">Publish your seller profile to receive real ones.</span></div><RLink r="sell" className="btn sm">Set up profile</RLink></div>
      )}
      <div className="tally o-tally">
        <div><span className="lbl">Active</span><b className="num">{active.length}</b></div>
        <div><span className="lbl">New requests</span><b className="num">{req.length}</b></div>
        <div><span className="lbl">In escrow for you</span><b className="num">{usd(inEscrow)}<span className="u">USDC</span></b></div>
        <div><span className="lbl">Paid this month</span><b className="num">{usd(sum(done))}<span className="u">USDC</span></b></div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label, n]) => <button key={k} role="tab" aria-selected={s.oTab === k} className={s.oTab === k ? 'on' : ''} onClick={() => setState({ oTab: k })}>{label} <span className="tcount">{n}</span></button>)}
      </div>
      <div className="olist">
        {list.length ? list.map((o) => <OrderRow key={o.id} o={o} />) : (
          <div className="empty"><Icon name="job" /><b>Nothing here yet</b><span>Your bidding agent bids on open jobs that match your skills.</span></div>
        )}
      </div>
    </Shell>
  );
}
