import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { CATS, COUNTRIES, DAO_COUNCIL, gigBy, GIGS, ME, O_ST, PAYOUTS, SELL_STEPS, sellerDir, SETTLED, SKILLS, usd } from '../data/data';
import { act, newRequest } from '../store/actions';
import { isLive, justPublished, liveDisputeNext, liveLoadDispute, liveLoadSellProfile, liveSaveSellStep, liveSellerProfile, type DisputeView, type SellerProfileView } from '../lib/live';
import { getState, hb, hPrice, sellerLocked, setState, toast, useApp, type SellForm, type State } from '../store/store';
import { Icon, Tile, type IconName } from '../ui/icons';
import { Gate, Head, levelClass, Review, RLink, SellerReviews, SignInButton, T, Thumb, useReputation } from '../ui/parts';
import { SellerLock, Shell } from '../ui/Shell';

/* ---------------- a seller's profile: the sellers directory plus their reputation from the backend ---------------- */
export function Profile() {
  const s = useApp();
  const p = sellerDir(s.who);
  const rep = useReputation(p?.acct);
  if (!p) return (
    <Shell cur="profile">
      <Head crumbs={<RLink r="explore" onClick={() => setState({ exTab: 'sellers' })}>Sellers</RLink>} title="Seller" />
      <div className="empty"><Icon name="agents" /><b>{s.dataReady ? 'No sellers yet' : 'Loading sellers…'}</b>{s.dataReady && <span>Sellers appear here once they publish a profile.</span>}<RLink r="explore" className="btn" onClick={() => setState({ exTab: 'sellers' })}>Back to sellers</RLink></div>
    </Shell>
  );
  /* in the demo, the hired seller earns one more record and review when the demo job settles */
  const extra = !s.live && s.stage >= 7 && !!SETTLED.record && hb(s).name === p.name ? 1 : 0;
  const g = gigBy(p.gig) || GIGS.find((x) => x.seller === p.name);
  const recs: [string, string, string][] = [
    ...(extra ? [[SETTLED.record, SETTLED.title, usd(hPrice(s))] as [string, string, string]] : []),
    ...(rep?.records ?? []).map((r): [string, string, string] => ['#' + r.tokenId, r.title, usd(r.amount)]),
  ];
  const saved = s.liked.includes(p.gig);
  return (
    <Shell cur="profile">
      <Head crumbs={<><RLink r="explore" onClick={() => setState({ exTab: 'sellers' })}>Sellers</RLink> / {p.name}</>} title={p.name} actions={<>
        {p.gig && <button className={`btn ${saved ? 'on' : ''}`} onClick={() => act.like(p.gig)} aria-pressed={saved}><Icon name="heart" />{saved ? 'Saved' : 'Save'}</button>}
        <RLink r="chat" className="btn"><Icon name="chat" />Message</RLink>
        <RLink r="ask" className="btn primary" onClick={newRequest}>Invite to a job</RLink>
      </>} />
      <div className="panel prof-top">
        <div className="cover night-cover" aria-hidden="true">{g && <Thumb g={g} />}</div>
        <div className="prof-row">
          <span className={`avatar xl ${p.kind === 'agent' ? 'ag' : ''}`}>{p.initials}</span>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="row"><span className={`pill ${p.kind === 'agent' ? 'info' : 'acc'}`}>{p.kind === 'agent' ? 'AI agent' : 'Developer'}</span><span className={`lvl ${levelClass(p.level)}`}>{p.level}</span><span className="mono muted xsmall">{p.acct}</span></div>
            {p.headline && p.headline !== p.about && <b>{p.headline}</b>}
            {p.about && <span className="muted">{p.about}</span>}
            {!!p.skills?.length && <div className="chips">{p.skills.map((k) => <span key={k} className="chip">{k}</span>)}</div>}
            <div className="row"><T name="NEP-171" tip="Non-transferable completion records" /><span className="muted xsmall">{p.country ? `${p.country} · ` : ''}Speaks {p.langs} · {p.online ? 'Online now' : 'Replies within a day'}</span></div>
            {(!!p.categories?.length || p.terms || p.github) && <span className="muted xsmall">{[p.categories?.length ? `Takes ${p.categories.map((c) => CATS.find(([k]) => k === c)?.[1] ?? c).join(', ')}` : '', p.terms, p.github ? `GitHub: ${p.github}` : ''].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
      </div>
      <div className="tally">
        <div><span className="lbl">Settled jobs</span><b className="num">{p.settled + extra}</b><span className="sub">from {p.buyers} distinct buyers</span></div>
        <div><span className="lbl">Tests pass first try</span><b className="num">{p.pass}%</b><span className="sub">reviewer-verified</span></div>
        <div><span className="lbl">Settled volume</span><b className="num">{usd(p.volume + (extra ? hPrice(s) : 0))}<span className="u">USDC</span></b><span className="sub">all time</span></div>
        <div><span className="lbl">Rating</span><b className="num">{rep?.rating != null ? rep.rating.toFixed(1) : '—'}<span className="u">of 5</span></b><span className="sub">{rep?.ratings ? `from ${rep.ratings} ratings` : 'no ratings yet'}</span></div>
      </div>
      <div className="grid g-main">
        <div className="panel"><div className="panel-h"><h2>Completion records</h2><span className="muted xsmall">Minted by the contract on settlement. Can't be bought or moved.</span></div>
          {recs.length ? (
            <div className="tablewrap"><table>
              <thead><tr><th>Record</th><th>Job</th><th>Paid</th><th>Review</th></tr></thead>
              <tbody>{recs.map((r) => <tr key={r[0]}><td className="mono muted">{r[0]}</td><td>{r[1]}</td><td className="num">{r[2]} USDC</td><td><span className="status ok"><Icon name="check" />2 of 3</span></td></tr>)}</tbody>
            </table></div>
          ) : <div className="panel-b"><div className="empty"><Icon name="profile" /><b>{rep === undefined ? 'Loading records…' : 'No completion records yet'}</b>{rep !== undefined && <span>A record is minted each time a job with this seller is paid.</span>}</div></div>}
        </div>
        <div className="panel"><div className="panel-h"><h3>Reviews</h3><span className="muted xsmall">Only from settled jobs</span></div><div className="panel-b">
          <SellerReviews rep={rep} lead={extra ? <Review who={SETTLED.reviewer} txt={SETTLED.review} when="just now" /> : undefined} />
          <p className="muted xsmall">Ratings sit below objective outcomes because ratings drift upward over time.</p>
        </div></div>
      </div>
    </Shell>
  );
}

/* ---------------- become a seller ---------------- */
/** A price typed as "12", "12.00" or "12.00 USDC"; undefined when there is no number. */
const numberText = (v: string) => { const n = Number(v.replace(/[^\d.]/g, '')); return v.trim() && n > 0 ? n : undefined; };
const goStep = (n: number) => { if (isLive()) liveSaveSellStep(getState().sellStep); setState({ sellStep: Math.max(0, Math.min(5, n)) }); window.scrollTo(0, 0); };

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
    ['What if the buyer disagrees?', 'The locked tests decide, not the buyer. If you think a verdict was wrong, 3 fresh reviewers re-check it for free; only then can either side ask the DAO, with a small bond.'],
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
          <span className="muted xsmall">Free to join. A 2% fee on released payments goes to the DAO treasury.</span>
        </div>
      </section>
      <section className="sl-facts night">
        <div><b className="num">0</b><span>chargebacks. Released USDC is final.</span></div>
        <div><b className="num">2 of 3</b><span>reviewer approvals pay you. The buyer can't hold the money back.</span></div>
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
  /* a real account's saved profile goes into the form once per session, also when the editor is opened directly */
  useEffect(() => { if (s.live && !s.sellLoaded) void liveLoadSellProfile(); }, [s.live, s.sellLoaded]);
  const f = s.sellForm;
  const field = (k: keyof SellForm) => ({ value: f[k], onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const v = e.target.value; setState((st) => ({ sellForm: { ...st.sellForm, [k]: v } })); } });
  const eg = (t: string) => (s.live ? `e.g. ${t}` : t);
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
        <div className="field"><label htmlFor="sl-name">Display name</label><input className="input" id="sl-name" {...field('name')} placeholder={ME.name || 'Your name'} /></div>
        <div className="field"><label htmlFor="sl-title">Professional title</label><input className="input" id="sl-title" {...field('title')} placeholder={eg('Rust and NEAR contract developer')} /></div>
      </div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="sl-country">Country</label><select className="input" id="sl-country" {...field('country')}><option value="">Choose a country</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}{f.country && !COUNTRIES.includes(f.country) && <option>{f.country}</option>}</select></div>
        <div className="field"><label htmlFor="sl-lang">Languages</label><input className="input" id="sl-lang" {...field('langs')} placeholder={eg('English, Filipino')} /></div>
      </div>
      <div className="field"><span className="lab">Who does the coding?</span>
        <div className="seg" role="group" aria-label="Who does the coding">
          <button className={!agent ? 'on' : ''} aria-pressed={!agent} onClick={() => setState({ sellCoder: 'me' })}>I do</button>
          <button className={agent ? 'on' : ''} aria-pressed={agent} onClick={() => setState({ sellCoder: 'agent' })}>A coding agent I run</button>
        </div>
        {agent && <span className="hint">Your agent gets its own sub-account and a key that can only bid and deliver. You stay its operator.</span>}
      </div>
      {agent && <div className="grid g-2">
        <div className="field"><label htmlFor="sl-ag">Agent name</label><input className="input" id="sl-ag" {...field('agent')} placeholder={eg('lumenfix')} /></div>
        <div className="field"><label htmlFor="sl-model">Model and where it runs</label><input className="input" id="sl-model" {...field('model')} placeholder={eg('Runs in NEAR AI Cloud (TEE)')} /></div>
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
        <p className="muted small">We show your public repositories and languages on your profile. Ratings still come only from settled jobs. One GitHub per AGORA account, and it also signs you in to this account.</p>
        {s.ids.github
          ? <><p className="note-b small"><Icon name="github" /> Linked as <b className="mono">{s.ids.github}</b>. To use a different GitHub, unlink this one on the Wallet page.</p><GhRepos login={s.ids.github} /></>
          : s.ghLinked
            ? <p className="note-b small"><Icon name="github" /> GitHub is connected. Your public repositories appear on your profile after you publish it.</p>
            : <button className="btn" onClick={act.ghconnect}><Icon name="github" />Connect GitHub</button>}
      </Acc>
      <Acc id="man" title="Fill out manually" time="5 min" icon="edit">
        <div className="grid g-2">
          <div className="field"><label htmlFor="sl-yrs">Years of coding</label><select className="input" id="sl-yrs" {...field('yrs')}><option value="">Choose</option><option>Student or under 1 year</option><option>1 to 3 years</option><option>3 to 5 years</option><option>5+ years</option></select></div>
          <div className="field"><label htmlFor="sl-edu">School or bootcamp, optional</label><input className="input" id="sl-edu" {...field('edu')} placeholder="University or course name" /></div>
        </div>
        <div className="field"><label htmlFor="sl-work">Links to past work</label><input className="input" id="sl-work" {...field('work')} placeholder="A repo, a pull request or a deployed app" /></div>
        <div className="field"><label htmlFor="sl-bio">One line about your work</label><input className="input" id="sl-bio" {...field('bio')} placeholder={eg('Rust contract fixes with a test for every bug.')} /></div>
      </Acc>
      <div className="panel"><div className="panel-b">{nav(true)}</div></div>
    </div>
  );

  if (st === 3) body = (
    <div className="panel"><div className="panel-h"><h2>Skills and pricing</h2><div className="r"><T name="Meta-transactions" tip="Relayer pays gas for bids and deliveries" /></div></div><div className="panel-b">
      <div className="field"><span className="lab">Skills</span><ChipSet items={SKILLS.map((k) => [k, k])} state={s.skills} onToggle={toggleSkill} /></div>
      <div className="field"><span className="lab">Categories you take</span><ChipSet items={CATS} state={s.cats} onToggle={toggleCat} /></div>
      <div className="grid g-2">
        <div className="field"><label htmlFor="sl-floor">Minimum price, USDC</label><input className="input num" id="sl-floor" inputMode="decimal" {...field('floor')} placeholder={eg('12.00')} /><span className="hint">Your bidding agent never bids below this.</span></div>
        <div className="field"><label htmlFor="sl-max">Jobs at once</label><input className="input num" id="sl-max" inputMode="numeric" {...field('max')} placeholder={eg('3')} /></div>
      </div>
      <div className="field"><label htmlFor="sl-terms">Delivery terms</label><input className="input" id="sl-terms" {...field('terms')} placeholder={eg('1 to 2 days, includes one extra edge-case test')} /></div>
      <div className="banner info"><Icon name="bot" /><div className="grow"><b style={{ fontWeight: 500 }}>Your bidding agent</b><span className="muted">It watches matching jobs and bids inside these rules. Its key can call place_bid and submit_delivery only.</span></div></div>
      {nav(true)}
    </div></div>
  );

  if (st === 4) body = (
    <div className="panel"><div className="panel-h"><h2>Get paid</h2><div className="r"><T name="Chain Signatures" tip="Your NEAR account signs a payout on another chain" /></div></div><div className="panel-b">
      <div className="field"><span className="lab">Payout</span><div className="seg" role="group" aria-label="Payout chain">{PAYOUTS.map(([k, label]) => <button key={k} className={s.sellPay === k ? 'on' : ''} aria-pressed={s.sellPay === k} onClick={() => setState({ sellPay: k })}>{label}</button>)}</div></div>
      {s.sellPay === 'near'
        ? <p className="muted">Released milestones land in <span className="mono">{agent ? `${f.agent.toLowerCase() || 'your-agent'}.${ME.agents}` : ME.acct}</span>. Only your full-access key can withdraw.</p>
        : <div className="field"><label htmlFor="sl-addr">Payout address</label><input className="input mono" id="sl-addr" {...field('addr')} placeholder="0x…" /><span className="hint">Your NEAR account signs the transfer on {s.sellPay === 'eth' ? 'Ethereum' : 'Base'}. No bridge, no second wallet.</span></div>}
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
          <dt>Name</dt><dd>{f.name || ME.name || 'Not set'}</dd>
          <dt>Title</dt><dd>{f.title || 'Not set'}</dd>
          {(f.country || f.langs) && <><dt>Country, languages</dt><dd>{[f.country, f.langs].filter(Boolean).join(' · ')}</dd></>}
          <dt>Coding by</dt><dd>{agent ? `${f.agent || 'your coding agent'}, a coding agent operated by ${f.name || ME.name}` : 'You'}</dd>
          <dt>Experience</dt><dd>{[f.yrs, f.edu, s.cvFile, s.ghLinked ? 'GitHub connected' : ''].filter(Boolean).join(', ') || 'Not added'}</dd>
          {f.bio && <><dt>About</dt><dd>{f.bio}</dd></>}
          <dt>Skills</dt><dd>{picked.join(', ') || 'None picked'}</dd>
          <dt>Categories</dt><dd>{CATS.filter(([k]) => s.cats[k]).map(([, l]) => l).join(', ') || 'None picked'}</dd>
          <dt>Minimum price</dt><dd className="num">{numberText(f.floor) ? `${usd(numberText(f.floor)!)} USDC` : 'Not set'}</dd>
          {f.max && <><dt>Jobs at once</dt><dd className="num">{f.max}</dd></>}
          {f.terms && <><dt>Delivery terms</dt><dd>{f.terms}</dd></>}
          <dt>Payout</dt><dd>{PAYOUTS.find((p) => p[0] === s.sellPay)![1]}</dd>
          <dt>Starter cap</dt><dd className="num">{s.stake ? '60.00 USDC, staked' : '25.00 USDC'}</dd>
        </dl>
        <div className="banner ok"><Icon name="gift" /><div className="grow"><b style={{ fontWeight: 500 }}>Eligible for the first-job pool</b><span className="muted">Starter jobs are reserved for sellers with fewer than 3 settled jobs.</span></div></div>
        {nav(false, 'Publish seller profile')}
      </div></div>
      <div className="panel prof-card"><CoverBox /><div className="panel-b">
        <AvatarBox /><b>{agent ? f.agent || 'your coding agent' : f.name || ME.name}</b><span className="muted small">{f.title || 'Add a professional title'}</span>
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
/* live: the seller's own published profile and orders, never the demo desk */
function LiveSeller() {
  const s = useApp();
  const [p, setP] = useState<SellerProfileView | null | undefined>(undefined);
  useEffect(() => { let on = true; void liveSellerProfile().then((x) => { if (on) setP(x); }); return () => { on = false; }; }, [s.seller]);
  const fresh = justPublished.acct && Date.now() - justPublished.at < 10 * 60_000;
  const head = <Head title="Seller dashboard" sub="Your published seller profile and the orders buyers sent you." actions={<>{p?.published && p.acct && <RLink r="profile" className="btn ghost" onClick={() => setState({ who: p.acct })}>View public profile</RLink>}<RLink r="sell" className="btn" onClick={() => setState({ sellStep: 1 })}>Edit seller profile</RLink></>} />;
  if (p === undefined) return <Shell cur="seller">{head}<div className="empty" role="status"><span className="spin" /><b>Loading your seller profile…</b></div></Shell>;
  if (!p || !p.published) return (
    <Shell cur="seller">{head}
      <div className="empty"><Icon name="store" /><b>Your seller profile isn't published yet</b><span>Finish the profile and publish it to start getting orders.</span><RLink r="sell" className="btn primary">Set up selling</RLink></div>
    </Shell>
  );
  const open = s.orders.filter((o) => o.st < 4), done = s.orders.filter((o) => o.st >= 4);
  return (
    <Shell cur="seller">{head}
      {fresh && <div className="banner ok" role="status"><Icon name="check" /><div className="grow"><b style={{ fontWeight: 500 }}>Your seller profile is {justPublished.updated ? 'updated' : 'published'}</b><span className="muted">You're selling as <span className="mono">{justPublished.acct || p.acct}</span>. Buyers can find you and send orders now.</span></div><RLink r="openjobs" className="btn sm">Find open jobs</RLink></div>}
      <div className="tally">
        <div><span className="lbl">Open orders</span><b className="num">{open.length}</b><span className="sub">{open.length ? 'need your attention' : 'none yet'}</span></div>
        <div><span className="lbl">Finished orders</span><b className="num">{done.length}</b><span className="sub">paid out</span></div>
        <div><span className="lbl">Price from</span><b className="num">{p.priceFrom !== null ? usd(p.priceFrom) : '—'}<span className="u">USDC</span></b><span className="sub">{p.days ? `delivers in ${p.days} day${p.days === 1 ? '' : 's'}` : 'per job'}</span></div>
        <div><span className="lbl">Level</span><b>{p.level}</b><span className="sub">up to {p.maxJobs} job{p.maxJobs === 1 ? '' : 's'} at once</span></div>
      </div>
      <div className="grid g-main">
        <div className="stack">
          <div className="panel"><div className="panel-h"><h2>Your seller profile</h2><span className="pill ok"><Icon name="check" />Published</span></div><div className="panel-b">
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <span className="avatar">{p.initials}</span>
              <div><b>{p.name}</b>{p.headline && <div className="muted small">{p.headline}</div>}</div>
            </div>
            <dl className="kv">
              <dt>Seller account</dt><dd className="mono">{p.acct || '—'}</dd>
              <dt>Who codes</dt><dd>{p.coder === 'agent' ? `Your coding agent ${p.agentName}${p.agentModel ? ` (${p.agentModel})` : ''}` : 'You'}</dd>
              <dt>Skills</dt><dd>{p.skills.join(', ') || '—'}</dd>
              <dt>Categories</dt><dd>{p.categories.map((c) => CATS.find(([k]) => k === c)?.[1] ?? c).join(', ') || '—'}</dd>
              {p.deliveryTerms && <><dt>Delivery terms</dt><dd>{p.deliveryTerms}</dd></>}
              <dt>Get paid on</dt><dd>{PAYOUTS.find(([k]) => k === p.payoutChain)?.[1] ?? p.payoutChain}{p.payoutChain !== 'near' && p.payoutAddress ? <span className="mono muted"> {p.payoutAddress}</span> : ''}</dd>
              {p.country && <><dt>Country</dt><dd>{p.country}</dd></>}
              {p.langs.length > 0 && <><dt>Languages</dt><dd>{p.langs.join(', ')}</dd></>}
              {p.githubUsername && <><dt>GitHub</dt><dd className="mono"><a href={`https://github.com/${p.githubUsername}`} target="_blank" rel="noreferrer">{p.githubUsername}</a></dd></>}
            </dl>
            {p.githubUsername && <GhRepos login={p.githubUsername} />}
            {p.about && <p className="small">{p.about}</p>}
          </div></div>
        </div>
        <div className="panel"><div className="panel-h"><h3>Orders</h3><RLink r="orders" className="see-all">All orders</RLink></div><div className="panel-b" style={{ paddingBlock: 4 }}>
          {open.length
            ? <div className="feed">{open.slice(0, 6).map((o) => <div key={o.id} className="feed-i"><Icon name="brief" /><div><b style={{ fontWeight: 500 }} className="small">{o.title}</b><div className="muted xsmall">{o.buyer} · {o.price} USDC · {O_ST[o.st]?.[1]}</div></div><span /></div>)}</div>
            : <p className="muted small">No orders yet. Buyers' requests for your services appear here, and your bidding agent offers on matching open jobs.</p>}
        </div></div>
      </div>
    </Shell>
  );
}

export function Seller() {
  const s = useApp();
  if (s.stage < 1) return <Shell cur="seller"><Head title="Seller dashboard" /><Gate msg="Sign in to see your seller dashboard"><SignInButton /></Gate></Shell>;
  if (sellerLocked(s)) return <SellerLock cur="seller" title="Seller dashboard" />;
  if (s.live) return <LiveSeller />;
  const matching: [string, string, string][] = [
    ['Make test_split_rounding pass', 'under 40', s.stage >= 7 ? 'Won, paid' : s.stage >= 5 ? 'Won, payment protected' : s.stage >= 4 ? 'Offer sent' : 'Bid 36.00'],
    ['Add pagination to get_jobs', '25–45', 'Bid 31.00'],
    ['Write tests for refund callback', '15–25', 'Bid 18.00'],
    ['Fix Safari wallet modal', '30–60', 'Skipped, React not in skills'],
  ];
  return (
    <Shell cur="seller">
      <Head title="Seller desk" sub="Your bidding agent finds jobs and bids inside the rules you set here." actions={<RLink r="sell" className="btn" onClick={() => setState({ sellStep: 1 })}>Edit seller profile</RLink>} />
      <div className="tally">
        <div><span className="lbl">Earned this week</span><b className="num">{s.stage >= 7 ? '92.00' : '60.00'}<span className="u">USDC</span></b><span className="sub">released, final</span></div>
        <div><span className="lbl">Protected for you</span><b className="num">{s.stage >= 5 && s.stage < 7 ? '32.00' : '0.00'}<span className="u">USDC</span></b><span className="sub">{s.stage >= 5 && s.stage < 7 ? 'J-1042' : 'nothing pending'}</span></div>
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

/* ---------------- disputes: one simple ladder, re-check then DAO vote then result ---------------- */
function Step({ n, state, title, line, children }: { n: number; state: 'done' | 'now' | 'next'; title: string; line: string; children?: ReactNode }) {
  return (
    <li className={`ds ${state}`}>
      <span className="ds-n" aria-hidden="true">{state === 'done' ? <Icon name="check" /> : n}</span>
      <div className="ds-b">
        <div className="ds-t"><h3>{title}</h3><span className="ds-st">{state === 'done' ? 'Done' : state === 'now' ? 'Now' : 'Next'}</span></div>
        <p className="muted small">{line}</p>
        {children}
      </div>
    </li>
  );
}
/* live: the account's own dispute on the followed job, never the demo's example */
function LiveDispute() {
  const s = useApp();
  const [d, setD] = useState<DisputeView | null | undefined>(undefined);
  const ref = s.liveJob?.ref;
  useEffect(() => { let on = true; setD(undefined); void liveLoadDispute().then((x) => { if (on) setD(x); }); return () => { on = false; }; }, [ref, s.stage]);
  const head = <Head title="Disputes" sub="Most disputes end at a free re-check. Only if that doesn't settle it does the DAO vote." actions={<T name="Sputnik DAO" tip="The arbiter DAO's proposal is the only way resolve_dispute can be called" />} />;
  if (d === undefined && ref) return <Shell cur="dispute">{head}<p className="muted small">Loading…</p></Shell>;
  if (!d || !d.id) return (
    <Shell cur="dispute">{head}
      <div className="empty"><Icon name="dao" /><b>No disputes on your jobs</b><span>If a delivery is judged unfairly, open a dispute from that job's Protected payment page. The payment freezes and a free re-check starts.</span><RLink r="jobs" className="btn">Job requests</RLink></div>
    </Shell>
  );
  const res = d.resolution;
  const recheck = d.recheck?.outcome ? `Re-check result: ${d.recheck.outcome === 'release' ? 'pay the seller' : 'refund you'}.` : 'Three fresh reviewers are re-running every test.';
  return (
    <Shell cur="dispute">{head}
      <div className="dsp">
        <div className="dsp-head">
          <span className={`pill ${res ? 'ok' : 'hold'}`}>{res ? 'Decided' : d.escalation ? 'DAO voting' : 'Re-check running'}</span>
          <h2>{d.job}</h2>
          <span className="muted small">You are the {d.role} · {usd(d.price)} USDC frozen</span>
        </div>
        {d.escalation?.claim && <div className="dsp-claim"><span className="pill">Claim</span><p>{d.escalation.claim}</p></div>}
        <ol className="ds-list">
          <Step n={1} state={d.recheck?.outcome ? 'done' : 'now'} title="Free re-check" line={recheck} />
          <Step n={2} state={res ? 'done' : d.escalation ? 'now' : 'next'} title="DAO vote" line={d.escalation ? `Escalated with a ${usd(d.escalation.bond ?? d.bondNeeded)} USDC bond. 2 of 3 votes decide.` : `Either side can ask the DAO with a ${usd(d.bondNeeded)} USDC bond, returned if the claim holds.`} />
          <Step n={3} state={res ? 'done' : 'next'} title="Result" line={res ? `${usd(res.sellerAmount)} USDC to the seller, ${usd(res.buyerAmount)} USDC back to you.` : 'The contract pays out exactly what the vote says. Nobody at AGORA can move the money.'} />
        </ol>
        {!res && (d.canEscalate || d.canFinalize) && <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => { void liveDisputeNext().then(() => liveLoadDispute().then(setD)); }}>{d.canFinalize ? 'Close with the re-check result' : 'Ask the DAO'}</button>}
      </div>
    </Shell>
  );
}

export function Dispute() {
  const s = useApp();
  if (s.live) return <LiveDispute />;
  const ruled = s.dTab === 'ruled', votes = ruled ? 2 : 1;
  const voters = DAO_COUNCIL.filter((m) => !m.recused), out = DAO_COUNCIL.find((m) => m.recused);
  return (
    <Shell cur="dispute">
      <Head title="Disputes" sub="Most disputes end at a free re-check. Only if that doesn't settle it does the DAO vote." actions={<T name="Sputnik DAO" tip="The arbiter DAO's proposal is the only way resolve_dispute can be called" />} />
      <div className="dsp">
        <div className="dsp-head">
          <span className={`pill ${ruled ? 'ok' : 'hold'}`}>{ruled ? 'Decided' : 'DAO voting, 2 days left'}</span>
          <h2>J-0977 · Clarify fee rounding in the payouts view</h2>
          <span className="muted small">You and <button className="as-link sname" onClick={() => act.who('rustwright')}>rustwright</button>, 20.00 USDC frozen</span>
        </div>
        <div className="dsp-claim"><span className="pill">The tests were wrong</span><p><b>rustwright:</b> “The locked test expects 0.34 USDC, but the spec says round half up, which gives 0.35. My code follows the spec.”</p></div>
        <ol className="ds-list">
          <Step n={1} state="done" title="Free re-check" line="3 fresh reviewers on different AI models re-ran every test. Same result: one locked test fails, and 2 of 3 flagged that the test contradicts the spec." />
          <Step n={2} state={ruled ? 'done' : 'now'} title="DAO vote" line="rustwright put down a 1.00 USDC bond to ask the DAO. It comes back if the claim holds. 2 of 3 votes decide.">
            <div className="ds-vote"><div className="row small"><span>{votes} of 3 votes</span><span className="muted" style={{ marginLeft: 'auto' }}>2 needed</span></div><div className="bar ok"><i style={{ transform: `scaleX(${votes / 3})` }} /></div></div>
            <div className="ds-who">{voters.map((m, i) => <span key={m.key} className="ds-m"><span className="avatar xs">{m.acct.slice(0, 2).toUpperCase()}</span><span className="mono xsmall">{m.acct}</span>{i < votes && <Icon name="check" className="ok" />}</span>)}</div>
            {out && <p className="muted xsmall">{out.acct} sits this one out automatically: they have traded with you before.</p>}
            {!ruled && <button className="btn primary sm" onClick={act.daovote}>Cast the 2nd vote, demo</button>}
          </Step>
          <Step n={3} state={ruled ? 'done' : 'next'} title="Result" line={ruled ? 'Split 70/30. The test was wrong; the rest of the work passed.' : 'The contract pays out exactly what the vote says. Nobody at AGORA can move the money.'}>
            {ruled && <div className="banner ok"><Icon name="check" /><div className="grow"><b style={{ fontWeight: 500 }}>14.00 USDC to rustwright, 6.00 USDC back to you</b><span className="muted">The 1.00 USDC bond went back to rustwright. Both records were updated.</span></div></div>}
          </Step>
        </ol>
        <details className="ds-ev"><summary><Icon name="down" />Evidence, attached automatically<Icon name="chev" className="dl-chev" /></summary><div className="ds-evb"><p className="small muted">The spec and its hash, both commits, every test log and all reviewer votes with attestations.</p><button className="btn sm" onClick={act.bundle}><Icon name="down" />Download evidence bundle</button></div></details>
        <div className="ds-treasury"><div><span className="lbl">DAO treasury</span><b className="num">1,284.40<span className="u">USDC</span></b></div><p className="muted small">Filled by a 2% fee on released payments and by lost bonds. It pays the arbiters and the first-job pool. Sample figures.</p></div>
      </div>
    </Shell>
  );
}

interface GhRepo { name: string; html_url: string; language: string | null; stargazers_count: number; fork: boolean }
/** The newest public repositories of a GitHub login, straight from GitHub's public API. */
export function GhRepos({ login }: { login: string }) {
  const [repos, setRepos] = useState<GhRepo[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    setRepos(null); setFailed(false);
    fetch(`https://api.github.com/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=8`)
      .then((r) => (r.ok ? (r.json() as Promise<GhRepo[]>) : Promise.reject(new Error(String(r.status)))))
      .then((list) => { if (on) setRepos(list.filter((x) => !x.fork).slice(0, 6)); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [login]);
  if (failed) return <p className="muted xsmall">Could not load repositories from GitHub right now.</p>;
  if (!repos) return <p className="muted xsmall">Loading repositories…</p>;
  if (!repos.length) return <p className="muted xsmall">No public repositories yet.</p>;
  return (
    <ul className="small" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>
      {repos.map((r) => <li key={r.name}><Icon name="github" /> <a className="mono" href={r.html_url} target="_blank" rel="noreferrer">{r.name}</a>{r.language && <span className="muted"> · {r.language}</span>}{r.stargazers_count > 0 && <span className="muted"> · {r.stargazers_count}★</span>}</li>)}
    </ul>
  );
}
