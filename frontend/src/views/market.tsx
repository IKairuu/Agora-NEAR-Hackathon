import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { BIDS, CATS, COUNTRIES, GIGS, ME, PAYOUTS, SELL_STEPS, SKILLS, usd } from '../data/sample';
import { act } from '../store/actions';
import { setState, toast, useApp, type State } from '../store/store';
import { Icon, Tile, type IconName } from '../ui/icons';
import { Gate, Head, Review, RLink, SignInButton, T, Thumb } from '../ui/parts';
import { Shell } from '../ui/Shell';

/* ---------------- seller profile (patchsmith) ---------------- */
export function Profile() {
  const s = useApp();
  const b = BIDS[0], extra = s.stage >= 7 ? 1 : 0;
  const saved = s.liked.includes('g1');
  const recs = ([['#412', 'Make test_split_rounding pass', '32.00', s.stage >= 7], ['#391', 'Fix NEP-141 refund on failed transfer', '28.00', true], ['#377', 'Add view method for escrow totals', '15.00', true], ['#360', 'Split dust bug in payroll vault', '22.00', true], ['#341', 'Storage deposit check in register()', '12.00', true], ['#329', 'Gas estimate for batch payouts', '40.00', true]] as const).filter((r) => r[3]);
  return (
    <Shell cur="profile">
      <Head crumbs={<><RLink r="explore">Talent</RLink> / patchsmith</>} title="patchsmith" actions={<>
        <button className={`btn ${saved ? 'on' : ''}`} onClick={() => act.like('g1')} aria-pressed={saved}><Icon name="heart" />{saved ? 'Saved' : 'Save'}</button>
        <RLink r="chat" className="btn"><Icon name="chat" />Message</RLink>
        <RLink r="post" className="btn primary">Invite to a job</RLink>
      </>} />
      <div className="panel prof-top">
        <div className="cover night-cover" aria-hidden="true"><Thumb g={GIGS[0]} /></div>
        <div className="prof-row">
          <span className="avatar xl ag">PA</span>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="row"><span className="pill info">AI agent</span><span className="mono muted xsmall">{b.acct}</span></div>
            <span className="muted">Run by Mara Ilves. Rust and NEAR SDK fixes, test writing, reasoning in a TEE.</span>
            <div className="row"><T name="NEP-171" tip="Non-transferable completion records" /><span className="muted xsmall">Payout on NEAR or Ethereum with Chain Signatures</span></div>
          </div>
        </div>
      </div>
      <div className="tally">
        <div><span className="lbl">Settled jobs</span><b className="num">{b.settled + extra}</b><span className="sub">from {b.buyers} distinct buyers</span></div>
        <div><span className="lbl">Tests pass first try</span><b className="num">92%</b><span className="sub">reviewer-verified</span></div>
        <div><span className="lbl">Settled volume</span><b className="num">{usd(1184 + extra * 32)}<span className="u">USDC</span></b><span className="sub">all time</span></div>
        <div><span className="lbl">Disputes and refunds</span><b className="num">1 and 1</b><span className="sub">1 split by the DAO</span></div>
      </div>
      <div className="grid g-main">
        <div className="panel"><div className="panel-h"><h2>Completion records</h2><span className="muted xsmall">Minted by the contract on settlement. Can't be bought or moved.</span></div>
          <div className="tablewrap"><table>
            <thead><tr><th>Record</th><th>Job</th><th>Paid</th><th>Review</th></tr></thead>
            <tbody>{recs.map((r) => <tr key={r[0]}><td className="mono muted">{r[0]}</td><td>{r[1]}</td><td className="num">{r[2]} USDC</td><td><span className="status ok"><Icon name="check" />2 of 3</span></td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="panel"><div className="panel-h"><h3>Reviews</h3><span className="muted xsmall">Only from settled jobs</span></div><div className="panel-b">
          {s.stage >= 7 && <Review who="Lumen Labs" txt="Fixed the split and added the dust test. Second commit was clean." when="just now" />}
          <Review who="Pollen Grants" txt="Delivered in under a day and explained the refund edge case." when="3 days ago" />
          <Review who="Ostrich DAO" txt="Good fix. Had to clarify scope once, settled through the DAO with a split." when="2 weeks ago" />
          <p className="muted xsmall">Ratings sit below objective outcomes because ratings drift upward over time.</p>
        </div></div>
      </div>
    </Shell>
  );
}

/* ---------------- become a seller ---------------- */
const goStep = (n: number) => { setState({ sellStep: Math.max(0, Math.min(5, n)) }); window.scrollTo(0, 0); };

/** Reads an image file into the store as a data URL (prototype: preview only, nothing is uploaded). */
function readImage(key: 'coverImg' | 'avatarImg') {
  return (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setState({ [key]: String(r.result) } as Partial<State>);
    r.readAsDataURL(file);
  };
}

function CoverBox({ edit }: { edit?: boolean }) {
  const { coverImg } = useApp();
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className={`cover ${coverImg ? 'has' : ''}`} style={coverImg ? { backgroundImage: `url('${coverImg}')` } : undefined}>
      {edit && <>
        <button className="btn sm glassy" onClick={() => file.current?.click()}><Icon name="camera" />{coverImg ? 'Change cover' : 'Add a cover photo, optional'}</button>
        <input type="file" ref={file} accept="image/*" hidden onChange={readImage('coverImg')} />
      </>}
    </div>
  );
}

function AvatarBox({ edit }: { edit?: boolean }) {
  const { avatarImg } = useApp();
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="pfp">
      {avatarImg ? <img src={avatarImg} alt="Your profile photo" /> : <span>{ME.initials}</span>}
      {edit && <>
        <button className="cam" onClick={() => file.current?.click()} aria-label="Upload a profile photo"><Icon name="camera" /></button>
        <input type="file" ref={file} accept="image/*" hidden onChange={readImage('avatarImg')} />
      </>}
    </div>
  );
}

function SellLanding() {
  const steps: [string, string][] = [
    ['Set up your seller profile', 'Fill it from LinkedIn, a CV or GitHub, or type it in. About 5 minutes.'],
    ['Set your rules once', 'Skills, a minimum price and delivery terms. Your bidding agent bids only inside them.'],
    ['Deliver a commit', "The buyer's USDC is already locked in escrow before you start."],
    ['Get paid when the tests pass', 'Two of three reviewers approve, and the contract pays you in seconds.'],
  ];
  const benefits: [IconName, string, string][] = [
    ['lock', 'Escrow before you start', "The buyer's USDC is locked in the contract when they accept your offer."],
    ['flask', 'Tests decide, not moods', "The definition of done is locked at acceptance, so scope can't grow later."],
    ['shield', 'Scams held for you', 'Off-platform payment requests and bait prices are flagged before they reach you.'],
    ['grad', 'A record employers can check', 'Every settled job mints a completion record tied to real payment.'],
    ['globe', 'Paid on your chain', 'Take USDC on NEAR, or on Ethereum and Base with Chain Signatures.'],
    ['bot', 'Code yourself or with an agent', 'Run a coding agent as your seller. Its key can only bid and deliver.'],
  ];
  const faq: [string, string][] = [
    ['Do I need a crypto wallet?', 'No. Sign in with Google, GitHub or email and AGORA creates a NEAR account for you. You can connect your own wallet later.'],
    ['Can a coding agent do the work?', 'Yes. Tell us in your profile. The agent gets a key that can only bid and submit deliveries, and you stay responsible for it.'],
    ['What if the buyer disagrees?', 'Reviewers run the locked tests. If the spec itself is unclear, the milestone freezes and an arbiter DAO decides with the logs as evidence.'],
    ['How fast is payment?', 'The contract releases USDC right after the second reviewer approves, usually a few seconds.'],
  ];
  return (
    <div className="sl">
      <section className="sl-hero">
        <div className="sl-art">
          <img className="sl-photo" src="/img/seller.jpg" alt="A developer with headphones writing code at a white desk" />
          <div className="sl-card rec" aria-hidden="true"><Tile size="sm" /><span><b>Completion record #412</b><span className="muted xsmall">Minted on settlement</span></span></div>
          <div className="sl-card pay" aria-hidden="true"><span className="muted xsmall">Released to you.testnet</span><span className="amt num">+32.00<span className="u">USDC</span></span><span className="xsmall"><Icon name="check" />2 of 3 reviewers approved</span></div>
        </div>
        <div className="sl-copy">
          <h1>Welcome, {ME.name}.</h1>
          <p className="muted">Sell your coding work on jobs where tests decide when you're done, and the money waits in escrow before you start.</p>
          <ol className="sl-steps">{steps.map(([b, t]) => <li key={b}><b>{b}</b><span className="muted small">{t}</span></li>)}</ol>
          <button className="btn primary lg" onClick={act.sellstart}>Let's do this</button>
          <span className="muted xsmall">Free to join. AGORA takes a small fee only from released payments.</span>
        </div>
      </section>
      <section className="sl-facts night">
        <div><b className="num">0</b><span>chargebacks. Released USDC is final.</span></div>
        <div><b className="num">72 h</b><span>auto-release if a buyer goes silent after review.</span></div>
        <div><b className="num">0 gas</b><span>for bids and deliveries. The relayer pays.</span></div>
        <div><b className="num">First-job pool</b><span>for sellers with fewer than 3 settled jobs.</span></div>
      </section>
      <section className="panel"><div className="panel-h"><h2>What you get</h2></div><div className="panel-b" style={{ paddingTop: 0 }}><div className="benefits">
        {benefits.map(([icon, b, p]) => <div key={b}><Icon name={icon} /><div><b>{b}</b><p>{p}</p></div></div>)}
      </div></div></section>
      <section className="faq2">
        <h2>Questions sellers ask</h2>
        {faq.map(([q, a]) => <details key={q}><summary>{q}<Icon name="chev" /></summary><p className="muted">{a}</p></details>)}
      </section>
      <section className="sl-end night"><h2>Your first paid job can come before your first review.</h2><button className="btn primary lg" onClick={act.sellstart}>Start your seller profile</button></section>
    </div>
  );
}

function ChipSet({ items, state, onToggle }: { items: [string, string][]; state: Record<string, boolean>; onToggle: (k: string) => void }) {
  return <div className="chips">{items.map(([k, label]) => <button key={k} className={`chip ${state[k] ? 'on' : ''}`} aria-pressed={!!state[k]} onClick={() => onToggle(k)}>{label}</button>)}</div>;
}
const toggleSkill = (k: string) => setState((s) => ({ skills: { ...s.skills, [k]: !s.skills[k] } }));
const toggleCat = (k: string) => setState((s) => ({ cats: { ...s.cats, [k]: !s.cats[k] } }));

function Acc({ id, title, time, badge, icon = 'chev', children }: { id: string; title: string; time: string; badge?: ReactNode; icon?: IconName; children: ReactNode }) {
  const { expOpen } = useApp();
  const open = expOpen === id;
  return (
    <div className={`acc ${open ? 'open' : ''}`}>
      <button className="acc-h" aria-expanded={open} onClick={() => setState({ expOpen: open ? '' : id })}><b>{title}</b><span className="muted small">{time}</span>{badge}<Icon name={icon} /></button>
      {open && <div className="acc-b">{children}</div>}
    </div>
  );
}

function CvUpload() {
  const { cvFile } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setState({ cvFile: f.name });
    toast(`Read ${f.name}: we filled in your title, skills and 3 past roles. Check them below.`);
  };
  return (
    <div className="drop">
      {cvFile ? <><Icon name="check" className="ok" /><b>{cvFile}</b><span className="muted small">Title, skills and 3 past roles filled in.</span></> : <span>Drag and drop a PDF, or</span>}
      <button className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" />{cvFile ? 'Choose another file' : 'Select file'}</button>
      <input type="file" ref={file} accept=".pdf,.doc,.docx" hidden onChange={onFile} />
    </div>
  );
}

export function Sell() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="sell"><Head title="Become a seller" /><Gate msg="Sign in to become a seller"><SignInButton /></Gate></Shell>;
  if (s.sellStep === 0) return <Shell cur="sell"><SellLanding /></Shell>;
  const st = s.sellStep, agent = s.sellCoder === 'agent';
  const nav = (next: boolean, label = 'Continue') => (
    <div className="row" style={{ justifyContent: 'space-between', paddingTop: 8 }}>
      <button className="btn" onClick={() => goStep(st - 1)}>Back</button>
      <button className="btn primary" onClick={next ? () => goStep(st + 1) : act.publishseller}>{label}</button>
    </div>
  );
  const picked = Object.keys(s.skills).filter((k) => s.skills[k]);
  let body: ReactNode = null;

  if (st === 1) body = (
    <div className="panel prof-edit"><CoverBox edit /><div className="panel-b">
      <div className="pf-row"><AvatarBox edit /><div className="muted small">A clear photo of your face, or your agent's logo. Buyers hire people they can picture.</div></div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="sl-name">Display name</label><input className="input" id="sl-name" defaultValue={ME.name} /></div>
        <div className="field"><label htmlFor="sl-title">Professional title</label><input className="input" id="sl-title" defaultValue="Rust and NEAR contract developer" /></div>
      </div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="sl-country">Country</label><select className="input" id="sl-country">{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="sl-lang">Languages</label><input className="input" id="sl-lang" defaultValue="English, Filipino" /></div>
      </div>
      <div className="field"><span className="lab">Who does the coding?</span>
        <div className="seg" role="group" aria-label="Who does the coding">
          <button className={!agent ? 'on' : ''} aria-pressed={!agent} onClick={() => setState({ sellCoder: 'me' })}>I do</button>
          <button className={agent ? 'on' : ''} aria-pressed={agent} onClick={() => setState({ sellCoder: 'agent' })}>A coding agent I run</button>
        </div>
        {agent && <span className="hint">Your agent gets its own sub-account and a key that can only bid and deliver. You stay its operator.</span>}
      </div>
      {agent && <div className="grid g-2">
        <div className="field"><label htmlFor="sl-ag">Agent name</label><input className="input" id="sl-ag" defaultValue="lumenfix" /></div>
        <div className="field"><label htmlFor="sl-model">Model and where it runs</label><input className="input" id="sl-model" defaultValue="Runs in NEAR AI Cloud (TEE)" /></div>
      </div>}
      {nav(true)}
    </div></div>
  );

  if (st === 2) body = (
    <div className="stack">
      <Acc id="cv" title="Upload your experience" time="2 min" badge={<span className="pill ok">Recommended</span>}>
        <div className="li-how">
          <div><b>Add experience from LinkedIn</b><ol><li>Go to your profile on LinkedIn</li><li>Click <b>Resources</b></li><li>Click <b>Save to PDF</b></li></ol></div>
          <div className="li-art" aria-hidden="true"><div className="bar3"><i /><i /><i /><span>linkedin.com</span></div><div className="li-p"><span className="avatar">{ME.initials}</span><i /><i className="s" /><span className="li-btns"><em>Open to</em><em>Add section</em><em className="on">Resources</em></span></div></div>
        </div>
        <CvUpload />
        <p className="note-b small"><b>No LinkedIn?</b> Upload your CV instead, same button.</p>
      </Acc>
      <Acc id="gh" title="Connect GitHub" time="1 min" badge={s.ghLinked ? <span className="pill ok">Connected</span> : undefined}>
        <p className="muted small">We show your public repositories and languages on your profile. Ratings still come only from settled jobs.</p>
        {s.ghLinked
          ? <div className="repos">{([['payroll-vault', 'Rust', 41], ['near-split', 'Rust', 12], ['wallet-kit', 'TypeScript', 30]] as const).map((r) => <span key={r[0]}><Icon name="repo" /><b>{r[0]}</b><span className="muted xsmall">{r[1]}, {r[2]} stars</span></span>)}</div>
          : <button className="btn" onClick={act.ghconnect}><Icon name="github" />Connect GitHub</button>}
      </Acc>
      <Acc id="man" title="Fill out manually" time="5 min" icon="edit">
        <div className="grid g-2">
          <div className="field"><label htmlFor="sl-yrs">Years of coding</label><select className="input" id="sl-yrs"><option>Student or under 1 year</option><option>1 to 3 years</option><option>3 to 5 years</option><option>5+ years</option></select></div>
          <div className="field"><label htmlFor="sl-edu">School or bootcamp, optional</label><input className="input" id="sl-edu" placeholder="University or course name" /></div>
        </div>
        <div className="field"><label htmlFor="sl-work">Links to past work</label><input className="input" id="sl-work" placeholder="A repo, a pull request or a deployed app" /></div>
        <div className="field"><label htmlFor="sl-bio">One line about your work</label><input className="input" id="sl-bio" defaultValue="Rust contract fixes with a test for every bug." /></div>
      </Acc>
      <div className="panel"><div className="panel-b">{nav(true)}</div></div>
    </div>
  );

  if (st === 3) body = (
    <div className="panel"><div className="panel-h"><h2>Skills and pricing</h2><div className="r"><T name="Meta-transactions" tip="Relayer pays gas for bids and deliveries" /></div></div><div className="panel-b">
      <div className="field"><span className="lab">Skills</span><ChipSet items={SKILLS.map((k) => [k, k])} state={s.skills} onToggle={toggleSkill} /></div>
      <div className="field"><span className="lab">Categories you take</span><ChipSet items={CATS} state={s.cats} onToggle={toggleCat} /></div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="sl-floor">Minimum price</label><input className="input num" id="sl-floor" defaultValue="12.00 USDC" /><span className="hint">Your bidding agent never bids below this.</span></div>
        <div className="field"><label htmlFor="sl-max">Jobs at once</label><input className="input num" id="sl-max" defaultValue="3" /></div>
      </div>
      <div className="field"><label htmlFor="sl-terms">Delivery terms</label><input className="input" id="sl-terms" defaultValue="1 to 2 days, includes one extra edge-case test" /></div>
      <div className="banner info"><Icon name="bot" /><div className="grow"><b style={{ fontWeight: 500 }}>Your bidding agent</b><span className="muted">It watches matching jobs and bids inside these rules. Its key can call place_bid and submit_delivery only.</span></div></div>
      {nav(true)}
    </div></div>
  );

  if (st === 4) body = (
    <div className="panel"><div className="panel-h"><h2>Get paid</h2><div className="r"><T name="Chain Signatures" tip="Your NEAR account signs a payout on another chain" /></div></div><div className="panel-b">
      <div className="field"><span className="lab">Payout</span><div className="seg" role="group" aria-label="Payout chain">{PAYOUTS.map(([k, label]) => <button key={k} className={s.sellPay === k ? 'on' : ''} aria-pressed={s.sellPay === k} onClick={() => setState({ sellPay: k })}>{label}</button>)}</div></div>
      {s.sellPay === 'near'
        ? <p className="muted">Released milestones land in <span className="mono">{agent ? 'lumenfix.agents.lumen.testnet' : ME.acct}</span>. Only your full-access key can withdraw.</p>
        : <div className="field"><label htmlFor="sl-addr">Payout address</label><input className="input mono" id="sl-addr" defaultValue="0x8b1F…4e2C" /><span className="hint">Your NEAR account signs the transfer on {s.sellPay === 'eth' ? 'Ethereum' : 'Base'}. No bridge, no second wallet.</span></div>}
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <button className={`switch ${s.stake ? 'on' : ''}`} onClick={() => setState({ stake: !s.stake })} aria-label="Optional starter stake" aria-pressed={s.stake} />
        <div><b style={{ fontWeight: 500 }}>Optional starter stake, 10.00 USDC</b><div className="muted xsmall">Raises your starter cap from 25 to 60 USDC before your 3rd settled job. Returned after clean jobs.</div></div>
      </div>
      {nav(true, 'Review')}
    </div></div>
  );

  if (st === 5) body = (
    <div className="grid g-main">
      <div className="panel"><div className="panel-h"><h2>Review and publish</h2></div><div className="panel-b">
        <dl className="kv">
          <dt>Coding by</dt><dd>{agent ? `lumenfix, a coding agent operated by ${ME.name}` : 'You'}</dd>
          <dt>Experience</dt><dd>{s.cvFile || 'Not uploaded'}{s.ghLinked ? ', GitHub connected' : ''}</dd>
          <dt>Skills</dt><dd>{picked.join(', ') || 'None picked'}</dd>
          <dt>Minimum price</dt><dd className="num">12.00 USDC</dd>
          <dt>Payout</dt><dd>{PAYOUTS.find((p) => p[0] === s.sellPay)![1]}</dd>
          <dt>Starter cap</dt><dd className="num">{s.stake ? '60.00 USDC, staked' : '25.00 USDC'}</dd>
        </dl>
        <div className="banner ok"><Icon name="gift" /><div className="grow"><b style={{ fontWeight: 500 }}>Eligible for the first-job pool</b><span className="muted">Starter jobs are reserved for sellers with fewer than 3 settled jobs.</span></div></div>
        {nav(false, 'Publish seller profile')}
      </div></div>
      <div className="panel prof-card"><CoverBox /><div className="panel-b">
        <AvatarBox /><b>{agent ? 'lumenfix' : ME.name}</b><span className="muted small">Rust and NEAR contract developer</span>
        <div className="chips">{picked.slice(0, 4).map((k) => <span key={k} className="chip">{k}</span>)}</div>
        <span className="muted xsmall">How buyers will see you</span>
      </div></div>
    </div>
  );

  return (
    <Shell cur="sell">
      <Head crumbs={<><a href="/sell" onClick={(e) => { e.preventDefault(); goStep(0); }}>Become a seller</a> / Profile</>} title="Your seller profile" />
      <div className="steps-h">{SELL_STEPS.map((x, i) => <div key={x} className={i + 1 < st ? 'done' : i + 1 === st ? 'now' : ''}>{x}</div>)}</div>
      {body}
    </Shell>
  );
}

/* ---------------- seller desk ---------------- */
export function Seller() {
  const s = useApp();
  const matching: [string, string, string][] = [
    ['Make test_split_rounding pass', 'under 40', s.stage >= 7 ? 'Won, paid' : s.stage >= 4 ? 'Won, in escrow' : 'Bid 36.00'],
    ['Add pagination to get_jobs', '25–45', 'Bid 31.00'],
    ['Write tests for refund callback', '15–25', 'Bid 18.00'],
    ['Fix Safari wallet modal', '30–60', 'Skipped, React not in skills'],
  ];
  return (
    <Shell cur="seller">
      <Head title="Seller desk" sub="Your bidding agent finds jobs and bids inside the rules you set here." actions={<RLink r="sell" className="btn" onClick={() => setState({ sellStep: 1 })}>Edit seller profile</RLink>} />
      <div className="tally">
        <div><span className="lbl">Earned this week</span><b className="num">{s.stage >= 7 ? '92.00' : '60.00'}<span className="u">USDC</span></b><span className="sub">released, final</span></div>
        <div><span className="lbl">In escrow for you</span><b className="num">{s.stage >= 5 && s.stage < 7 ? '32.00' : '0.00'}<span className="u">USDC</span></b><span className="sub">{s.stage >= 5 && s.stage < 7 ? 'J-1042' : 'nothing pending'}</span></div>
        <div><span className="lbl">Open bids</span><b className="num">3</b><span className="sub">by your bidding agent</span></div>
        <div><span className="lbl">Win rate</span><b className="num">38%</b><span className="sub">last 30 days</span></div>
      </div>
      <div className="grid g-main">
        <div className="stack">
          <div className="panel"><div className="panel-h"><h2>Bidding agent rules</h2><div className="r"><T name="Meta-transactions" tip="Relayer pays gas for bids and deliveries" /></div></div><div className="panel-b">
            <div className="grid g-2">
              <div className="field"><label htmlFor="s-floor">Price floor</label><input className="input num" id="s-floor" defaultValue="12.00 USDC" /></div>
              <div className="field"><label htmlFor="s-max">Max jobs at once</label><input className="input num" id="s-max" defaultValue="3" /></div>
            </div>
            <div className="field"><span className="lab">Skills</span><ChipSet items={['Rust', 'NEAR SDK', 'NEP-141', 'React', 'Tests'].map((k) => [k, k])} state={s.skills} onToggle={toggleSkill} /></div>
            <div className="field"><label htmlFor="s-terms">Delivery terms</label><input className="input" id="s-terms" defaultValue="1 to 2 days, includes one extra edge-case test" /></div>
          </div></div>
          <div className="panel"><div className="panel-h"><h2>Get paid</h2><div className="r"><T name="Chain Signatures" tip="NEAR account signs a payout on another chain" /></div></div><div className="panel-b">
            <div className="seg" role="group" aria-label="Payout chain">{PAYOUTS.map(([k, label]) => <button key={k} className={s.payout === k ? 'on' : ''} aria-pressed={s.payout === k} onClick={() => setState({ payout: k })}>{label}</button>)}</div>
            {s.payout === 'near'
              ? <p className="muted">Released milestones land in your seller account. The balance can only be withdrawn with your full-access key.</p>
              : <div className="field"><label htmlFor="s-addr">Payout address</label><input className="input mono" id="s-addr" defaultValue="0x8b1F…4e2C" /><span className="hint">Your NEAR account signs the transfer on {s.payout === 'eth' ? 'Ethereum' : 'Base'} with Chain Signatures. No bridge, no second wallet.</span></div>}
          </div></div>
        </div>
        <div className="panel"><div className="panel-h"><h3>Matching jobs</h3></div><div className="panel-b" style={{ paddingBlock: 4 }}><div className="feed">
          {matching.map(([t, b, st]) => {
            const won = st.startsWith('Won'), skip = st.startsWith('Skip');
            return <div key={t} className="feed-i"><Icon name={won ? 'check' : skip ? 'x' : 'bolt'} className={won ? 'ok' : ''} /><div><b style={{ fontWeight: 500 }} className="small">{t}</b><div className="muted xsmall">{b} USDC, {st}</div></div><span /></div>;
          })}
        </div></div></div>
      </div>
    </Shell>
  );
}

/* ---------------- disputes ---------------- */
export function Dispute() {
  const s = useApp();
  const ruled = s.dTab === 'ruled';
  const votes: [string, number, string][] = [['Approve', ruled ? 4 : 3, ''], ['Reject', 1, 'block'], ['Not voted', ruled ? 0 : 1, 'hold']];
  return (
    <Shell cur="dispute">
      <Head title="Disputes" sub="A dispute freezes one milestone. Only the arbiter DAO can release, refund or split it." actions={<T name="Sputnik DAO" tip="arbiter.sputnik-dao.testnet is the only account allowed to call resolve_dispute" />} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={!ruled} className={!ruled ? 'on' : ''} onClick={() => setState({ dTab: 'open' })}>Open, 1</button>
        <button role="tab" aria-selected={ruled} className={ruled ? 'on' : ''} onClick={() => setState({ dTab: 'ruled' })}>Ruled, 14</button>
      </div>
      <div className="grid g-main">
        <div className="panel"><div className="panel-h"><span className={`pill ${ruled ? 'ok' : 'hold'}`}>{ruled ? 'Ruled, split 70/30' : 'Voting, 1 day left'}</span><h2>J-0977, responsive job list on mobile</h2></div><div className="panel-b">
          <dl className="kv"><dt>Buyer</dt><dd className="mono">tidewater.testnet</dd><dt>Seller</dt><dd className="mono">ivarga.testnet</dd><dt>Frozen</dt><dd className="num">Milestone 2, 30.00 USDC</dd><dt>Claim</dt><dd>Buyer says the layout breaks at 360px; seller says 360px was not in the spec.</dd></dl>
          <h3>Evidence bundle</h3>
          <div className="tablewrap"><table><tbody>
            <tr><td>Acceptance spec</td><td className="mono muted">spec 2d81…be0c</td><td><span className="pill">Viewports 390, 768, 1280</span></td></tr>
            <tr><td>Reviewer A</td><td className="mono muted">log 0x11fa…</td><td><span className="pill ok">Approve</span></td></tr>
            <tr><td>Reviewer B</td><td className="mono muted">log 0x7c02…</td><td><span className="pill ok">Approve</span></td></tr>
            <tr><td>Reviewer C</td><td className="mono muted">log 0xa9d4…</td><td><span className="pill block">Reject, 360px overflow</span></td></tr>
            <tr><td>Rerun command</td><td className="mono muted" colSpan={2}>npx playwright test --project=mobile</td></tr>
          </tbody></table></div>
          <p className="muted small">Reviewer logs are hashed on-chain, so any DAO member can rerun the tests and get the same result.</p>
        </div></div>
        <div className="stack">
          <div className="panel"><div className="panel-h"><h3>DAO proposal #57</h3></div><div className="panel-b">
            <p className="small">Split: 70% to seller (in-spec viewports pass), 30% refund to buyer.</p>
            {votes.map(([l, n, k]) => <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><div className="row small"><span>{l}</span><b className="num" style={{ marginLeft: 'auto', fontWeight: 500 }}>{n} of 5</b></div><div className={`bar ${k}`}><i style={{ transform: `scaleX(${n / 5})` }} /></div></div>)}
            {ruled
              ? <div className="banner ok"><Icon name="check" /><div className="grow"><b style={{ fontWeight: 500 }}>Executed</b><span className="muted">21.00 USDC to seller, 9.00 USDC refunded. The contract updated both reputations.</span></div></div>
              : <button className="btn primary" onClick={act.daovote}>Cast the 4th vote as a DAO member</button>}
            <span className="mono muted xsmall">arbiter.sputnik-dao.testnet, 5 members, 3 of 5 to pass</span>
          </div></div>
          <div className="panel"><div className="panel-b"><b style={{ fontWeight: 500 }}>Who can rule</b><p className="muted small">Not AGORA, not the reviewers, not either party. The contract accepts a ruling only from the DAO account after a proposal passes.</p></div></div>
        </div>
      </div>
    </Shell>
  );
}
