import type { ReactNode } from 'react';
import { ATTACK, CHATS, gigBy, REPLIES, sellerBy, type ChatFrom } from '../data/sample';
import { closeModal, getState, openModal, setState, storage, toast, type ChatMsg } from './store';

/* ---------------- navigation ---------------- */
type NavFn = (to: string) => void;
let navigateFn: NavFn = (to) => { location.assign(to); };
export const setNavigate = (fn: NavFn) => { navigateFn = fn; };
/** Route names follow the prototype: 'home', 'ask', 'jobs', ... */
export const pathOf = (r: string) => (r === 'home' ? '/' : '/' + r);
export function go(r: string) {
  navigateFn(pathOf(r));
  window.scrollTo(0, 0);
}

/* ---------------- chat ---------------- */
export function chatLog(key: string): ChatMsg[] {
  const s = getState();
  return s.chatLog[key] ?? (CHATS[key] ?? []).map(([from, text]: [ChatFrom, string]) => ({ from, text }));
}
export function sendChat(raw: string) {
  const text = raw.trim();
  if (!text) return;
  const key = getState().chatWith;
  const log = [...chatLog(key), { from: 'me' as const, text }];
  if (/telegram|whatsapp|outside|off.?platform|paypal|direct(ly)? pay/i.test(text))
    log.push({ from: 'held', text: 'The fraud and lure agent flagged this message. Payment outside escrow is not protected, and the contract only pays the seller account bound to this job.' });
  setState((s) => ({ chatLog: { ...s.chatLog, [key]: log }, typing: true }));
  setTimeout(() => {
    setState((s) => ({ typing: false, chatLog: { ...s.chatLog, [key]: [...chatLog(key), { from: 'them', text: REPLIES[key] }] } }));
  }, 1100);
}

/* ---------------- tour ---------------- */
interface TourStep { r: string; st: number; t: string; p: string; d: ReactNode; act?: () => void }
export const TOUR: TourStep[] = [
  { r: 'home', st: 0, t: 'Meet AGORA', p: 'A marketplace for small code jobs where the tests decide when work is done. This demo follows one job from a sentence to a paid commit, then tries to break it.', d: <>Press <b>Next</b>, or sign in with Google.</> },
  { r: 'ask', st: 1, t: 'Ask in one sentence', p: 'After Google sign-in, buyers land on one prompt. Type the problem or pick a popular service; the spec writer takes it from there.', d: <>Pick a service card, or press <b>Next</b>.</> },
  { r: 'post', st: 1, t: 'Tests become the definition of done', p: 'The spec writer reads the repo and writes tests that fail today. The buyer only explains what is broken.', d: <>Click <b>Write the tests for me</b>.</>, act: () => setState({ specGen: false }) },
  { r: 'post', st: 2, t: 'The spec is locked on-chain', p: 'The buyer approved 2 failing tests and 6 checks. Posting stores their hash, so nobody can change them later.', d: 'Scroll to Step 3 to see the private limit.' },
  { r: 'job', st: 3, t: 'Bids arrive, lures are held', p: 'Four valid bids from developers and AI agents. Two more were held: one asks to skip escrow and pay off-platform, the other bids 2 USDC from a 3-hour-old account.', d: <>Scroll to <b>Held by safety agents</b>.</>, act: () => setState({ jobTab: 'bids' }) },
  { r: 'job', st: 4, t: 'The buyer agent negotiates privately', p: 'It waited for 3 offers instead of taking the first, then settled at 32.00, under the 35.50 median. The 38 USDC limit never left the enclave.', d: <>Read the log, then press <b>Next</b>.</>, act: () => setState({ jobTab: 'neg' }) },
  { r: 'chat', st: 4, t: "Talk to the agent's pick", p: "The agent opened a chat with patchsmith and already asked the basics. Two backups wait in order if this one doesn't work out.", d: <>Answer with a quick reply, or click <b>Talk</b> on a backup.</>, act: () => setState({ chatWith: 'patchsmith' }) },
  { r: 'mandate', st: 4, t: 'The contract enforces the limits', p: 'Before funding, try something the mandate forbids. The contract refuses a 400 USDC job because the per-job cap is 50.', d: <>Click <b>Fund 400 USDC job</b>.</> },
  { r: 'room', st: 5, t: 'Money locks in escrow', p: 'The transaction agent called fund_job. Nine checks passed and 32.00 USDC is now held by the contract, not by AGORA or the agent.', d: <>Click <b>Simulate a bad delivery</b>.</> },
  { r: 'room', st: 6, t: 'A cheating delivery is rejected', p: 'The first commit edited the locked test to make it pass. All three reviewers rejected it and nothing was paid.', d: <>Click <b>Run review on this commit</b> for the real fix.</> },
  { r: 'room', st: 7, t: 'Two approvals release payment', p: 'Three reviewers on different models ran the tests in TEEs. After the second approval the contract released 32.00 USDC and minted a completion record.', d: <>Press <b>Next</b> to see the seller's record.</>, act: () => setState({ votes: [2, 2, 2] }) },
  { r: 'profile', st: 7, t: 'Reputation only from settled jobs', p: 'Record #412 and the review exist because money actually moved. Objective outcomes come first, ratings second.', d: '' },
  { r: 'agents', st: 7, t: 'Someone steals the agent key', p: 'The attacker tries to drain the account. The protocol and the contract reject every call, and the guardian pauses the team.', d: <>Click <b>Run the drill</b>.</> },
  { r: 'sell', st: 7, t: 'Become a seller', p: 'From the profile menu, Become a seller opens a short welcome, then a profile you can fill from LinkedIn, a CV or GitHub. The coding can be done by you or by a coding agent you run.', d: <>Click <b>Let's do this</b>.</>, act: () => setState({ sellStep: 0 }) },
  { r: 'dispute', st: 8, t: 'Disputes go to a DAO', p: 'When the spec is unclear, one milestone freezes and a Sputnik DAO decides with the reviewer logs as evidence.', d: <>Click <b>Cast the 4th vote</b>.</> },
  { r: 'wallet', st: 8, t: 'A wallet that stays simple', p: 'One balance, four actions. Buyers can add funds from other chains through NEAR Intents, and agents can never withdraw.', d: <>That's the full loop. Press <b>Finish</b>.</> },
];
export function tourGo(i: number) {
  const s = TOUR[i];
  setState((st) => ({ tour: i, stage: s.st, attack: null, voting: false, role: s.st >= 1 && !st.role ? 'hire' : st.role, tourMin: false, modal: null }));
  s.act?.();
  if (s.st === 8) setState({ attack: { n: ATTACK.length } });
  go(s.r);
}
/** Advance the tour when the visitor does what the current step asks. */
export const tourStep = (from: number, to: number) => { if (getState().tour === from) setState({ tour: to }); };

/* ---------------- actions, the prototype's ACT table ---------------- */
export const act = {
  signin: () => openModal('signin'),
  signsell: () => {
    if (getState().stage >= 1) { setState({ sellStep: 0 }); go('sell'); return; }
    setState({ after: 'sell', rolePick: 'work' }); openModal('signin');
  },
  signVia: (via: string) => { setState({ signVia: via }); act.signin2(); },
  signin2: () => {
    setState((s) => ({ stage: Math.max(s.stage, 1) }));
    toast('Signed in as lumen.testnet. Agent sub-account created.');
    const s = getState();
    if (s.tour === 0) { closeModal(); tourGo(1); return; }
    setState({ rolePick: s.after === 'sell' ? 'work' : s.after === 'ask' ? 'hire' : s.role });
    openModal('role');
  },
  rolepick: () => { setState((s) => ({ rolePick: s.role })); openModal('role'); },
  rolego: () => {
    const r = getState().rolePick; if (!r) return;
    setState({ role: r, after: null, modal: null });
    if (r === 'hire') go('ask'); else { setState({ sellStep: 0 }); go(getState().seller ? 'seller' : 'sell'); }
  },
  roleskip: () => { setState((s) => ({ role: s.role || 'hire', modal: null })); go('ask'); },
  signout: () => { setState({ stage: 0, role: null, tour: -1 }); go('home'); toast('Signed out.'); },
  attachrepo: () => toast('In the prototype the repository is github.com/lumen-labs/payroll-vault at a41c9e2.'),
  genspec: () => { setState({ specGen: true }); toast('Spec writer added 2 failing tests and 6 checks. Review them below.'); tourStep(2, 3); },
  postjob: () => { setState((s) => ({ stage: Math.max(s.stage, 2) })); toast('Posted J-1042. Spec hash 7c3e9a…91af stored on-chain.'); },
  bids: () => { setState((s) => ({ stage: Math.max(s.stage, 3), jobTab: 'bids' })); toast('2 bids held by the fraud and lure agent.', 'hold'); },
  negotiate: () => { setState((s) => ({ stage: Math.max(s.stage, 4), jobTab: 'neg' })); toast('Your agent picked patchsmith at 32.00 USDC and opened a chat.'); },
  fund: () => openModal('fund'),
  send: () => openModal('send'),
  receive: () => openModal('receive'),
  addfunds: () => openModal('addfunds'),
  dispute: () => openModal('dispute'),
  unpause: () => openModal('unpause'),
  fund2: () => { setState((s) => ({ modal: null, stage: Math.max(s.stage, 5) })); go('room'); toast('32.00 USDC locked in escrow for J-1042.'); },
  overcap: () => toast(<><b>Rejected by contract.</b> fund_job 400.00 USDC is over your per-job cap of 50.00. 0 USDC moved.</>, 'block', 5200),
  wrongcat: () => toast(<><b>Rejected by contract.</b> Category "Design" is not on your allowed list.</>, 'block'),
  withdraw: () => toast(<><b>Rejected by NEAR.</b> The agent key has no permission to call withdraw.</>, 'block'),
  deletekey: () => toast('Deleting a key needs your full-access key. You would confirm with Google sign-in here.', 'hold'),
  stopneg: () => toast('In the prototype the negotiation has already finished. Your agent agreed 32.00 USDC with patchsmith.', 'hold'),
  withdrawme: () =>toast('Withdrawals need your full-access key. You would confirm with Google sign-in here.', 'hold'),
  send2: () => { closeModal(); toast('In the prototype nothing is sent. On testnet this is a full-access key transfer.', 'hold'); },
  copyacct: () => { try { void navigator.clipboard.writeText('lumen.testnet'); } catch { /* ignore */ } toast('Copied lumen.testnet.'); },
  intents: () => toast('Dry-run quote refreshed: 100.00 USDC on Base becomes 99.71 USDC on NEAR.'),
  baddeliver: () => { setState((s) => ({ stage: Math.max(s.stage, 6) })); toast(<><b>Delivery rejected.</b> Commit 3b9c2aa edited a locked test. 0 of 3 approved.</>, 'block', 5200); },
  gooddeliver: () => {
    setState((s) => ({ stage: s.stage < 6 ? 6 : s.stage, voting: true, votes: [1, 0, 0] }));
    const steps: [number, number[]][] = [[700, [1, 1, 0]], [1400, [2, 1, 1]], [2100, [2, 2, 1]]];
    steps.forEach(([ms, v]) => setTimeout(() => {
      setState({ votes: v });
      if (v[1] === 2) {
        setState({ stage: 7, voting: false });
        toast(<><b>32.00 USDC released</b> to patchsmith.agents.testnet after 2 of 3 approvals.</>);
        tourStep(9, 10);
      }
    }, ms));
    setTimeout(() => setState({ votes: [2, 2, 2] }), 3200);
  },
  rate: () => toast('Rating saved. It is tied to settled job J-1042.'),
  dispute2: () => { closeModal(); toast('In the prototype, see the example dispute J-0977.', 'hold'); go('dispute'); },
  daovote: () => { setState({ dTab: 'ruled' }); toast('Proposal #57 passed 4 of 5. The contract split the milestone 70/30.'); },
  attack: () => {
    setState({ attack: { n: 0 } });
    const tick = () => {
      const n = (getState().attack?.n ?? 0) + 1;
      setState({ attack: { n } });
      if (n >= ATTACK.length) { setState((s) => ({ stage: Math.max(s.stage, 8) })); toast(<><b>Guardian paused your agents.</b> 0.00 USDC moved.</>, 'block', 5200); return; }
      setTimeout(tick, 550);
    };
    setTimeout(tick, 550);
  },
  pause: () => { setState((s) => ({ stage: Math.max(s.stage, 8) })); toast('All agents paused. Funding and release calls are stopped.', 'block'); },
  unpause2: () => { setState({ modal: null, stage: 7, attack: null }); toast('Key rotated. Agents are active again.'); },
  savemandate: () => toast('Limits saved on-chain with your full-access key.'),
  publishseller: () => { setState({ seller: true, sellStep: 0 }); go('seller'); toast('Seller profile published. Your bidding agent is watching matching jobs.'); },
  reqsvc: () => { if (getState().stage < 1) { act.signin(); return; } openModal('reqsvc'); },
  reqsvc2: (what: string) => {
    const s = getState(); const gg = gigBy(s.svc)!; const id = 'J-' + s.nextJob;
    const title = what || gg.prompt;
    setState({
      nextJob: s.nextJob + 1, modal: null,
      newJobs: [{ id, title: title.length > 70 ? title.slice(0, 68) + '…' : title, cat: gg.cat, budget: gg.from + '.00', status: ['info', 'Offered to ' + gg.seller], who: gg.seller, note: 'Waiting for the seller to accept. Escrow funds when they do.' }, ...s.newJobs],
    });
    go('jobs');
    toast(`${id} sent to ${gg.seller}. The spec writer is drafting the tests.`);
  },
  msgsvc: () => {
    const s = getState(); const gg = gigBy(s.svc)!;
    const k = ({ patchsmith: 'patchsmith', 'Dana Okafor': 'dana', rustwright: 'rustwright' } as Record<string, string>)[gg.seller];
    if (k && s.stage >= 4) { setState({ chatWith: k }); go('chat'); return; }
    toast(`Message sent to ${gg.seller}. Replies arrive in Messages.`);
  },
  fold: () => { const fold = !getState().fold; storage.set('agora-fold', fold ? '1' : '0'); setState({ fold }); },
  like: (id: string) => {
    const s = getState();
    if (s.liked.includes(id)) setState({ liked: s.liked.filter((x) => x !== id) });
    else { setState({ liked: [...s.liked, id] }); toast(`Saved ${gigBy(id)!.seller}. Your buyer agent will ask them first on matching jobs.`); }
  },
  openGig: (id: string) => {
    if (getState().stage < 1) { act.signin(); return; }
    setState({ svc: id }); go('svc'); tourStep(1, 2);
  },
  ghconnect: () => { setState({ ghLinked: true }); toast('GitHub connected: 14 public repositories found. Reputation still comes only from settled jobs.'); },
  sellstart: () => { setState({ sellStep: 1 }); window.scrollTo(0, 0); },
  talk: (key: string) => { setState({ chatWith: key }); toast(`Your agent opened a chat with ${sellerBy(key)!.name} and asked the same basics.`); },
  theme: () => {
    const r = document.documentElement;
    const cur = r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', nx); storage.set('agora-theme', nx);
  },
  tour: () => tourGo(0),
  tournext: () => {
    const t = getState().tour;
    if (t >= TOUR.length - 1) { setState({ tour: -1 }); toast('Demo finished. Everything stays clickable.'); return; }
    tourGo(t + 1);
  },
  tourback: () => { const t = getState().tour; if (t > 0) tourGo(t - 1); },
  tourend: () => setState({ tour: -1 }),
  /** Hero search and quick suggestions: draft the request, then sign in if needed. */
  heroGo: (v: string, focusInput: () => void) => {
    if (!v) { toast('Describe the job first, or pick a suggestion.', 'hold'); focusInput(); return; }
    setState({ draft: v });
    if (getState().stage >= 1) { go('ask'); return; }
    setState({ after: 'ask' }); act.signin();
  },
  /** The New request composer. */
  submitAsk: (v: string) => {
    if (!v) { toast('Describe the job first, or pick a popular service.', 'hold'); return; }
    const s = getState();
    if (s.stage >= 2) {
      const id = 'J-' + s.nextJob;
      setState({ nextJob: s.nextJob + 1, draft: '', newJobs: [{ id, title: v.length > 70 ? v.slice(0, 68) + '…' : v, cat: 'Code, to be tagged', budget: 'set by your agent', status: ['', 'Writing tests'], who: '', note: 'The spec writer is reading the repo. You approve the tests before it posts.' }, ...s.newJobs] });
      go('jobs'); toast(`${id} started. You'll approve its tests before it posts.`); return;
    }
    setState({ draft: v, specGen: false }); go('post');
    toast('Sent to the spec writer. Check the details, then let it write the tests.');
    tourStep(1, 2);
  },
  signMail: (v: string) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('Enter an email address, like you@example.com.', 'hold'); return false; }
    setState({ signVia: 'email' });
    toast(`In the real app a one-time code goes to ${v}. Skipping it in the prototype.`);
    act.signin2();
    return true;
  },
};
