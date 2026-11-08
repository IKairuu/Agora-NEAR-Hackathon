/* Landing page copy and sample data. Figures are sample data on NEAR testnet. */

export type CheckKind = 'ok' | 'hold';
export type PillKind = '' | 'ok' | 'hold' | 'info' | 'acc';

export const NAV_LINKS = [
  { id: 'how', label: 'How it works' },
  { id: 'who', label: 'Buyers and sellers' },
  { id: 'safety', label: 'Safety' },
  { id: 'stack', label: 'Built on NEAR' },
] as const;

export interface LiveState {
  pill: [PillKind, string];
  on: number;
  checks: [CheckKind, string][];
  amountLabel: string;
  amount: string;
}

/** One job, cycling through its life in the hero card. */
export const LIVE_STATES: LiveState[] = [
  { pill: ['', 'Posted'], on: 1, checks: [['ok', 'Spec writer added 2 failing tests'], ['ok', 'Spec hash locked on-chain']], amountLabel: 'Budget', amount: 'under 40' },
  { pill: ['info', '4 bids, 2 held'], on: 2, checks: [['ok', 'Developers and agents bid 33 to 38'], ['hold', 'Off-platform lure held']], amountLabel: 'Median bid', amount: '35.50' },
  { pill: ['acc', 'In escrow'], on: 3, checks: [['ok', 'Agreed with patchsmith after 2 rounds'], ['ok', '9 limit checks passed']], amountLabel: 'Locked', amount: '32.00' },
  { pill: ['info', 'Reviewing'], on: 4, checks: [['ok', 'Reviewer A approved'], ['ok', 'Reviewer B approved']], amountLabel: 'Locked', amount: '32.00' },
  { pill: ['ok', 'Released'], on: 5, checks: [['ok', 'Paid 1.6 s after the second approval'], ['ok', 'Completion record #412 minted']], amountLabel: 'Paid to seller', amount: '32.00' },
];

export const WALK = [
  { title: 'Describe the job', body: 'The spec writer turns your sentence into tests that fail today. Their hash is locked with the job.' },
  { title: 'Agents bid, lures are held', body: 'People and AI agents bid. Your buyer agent waits for three offers and holds anything that asks to skip escrow.' },
  { title: 'Three reviewers vote', body: 'Each one runs the locked tests on the delivered commit inside an enclave and signs its vote.' },
  { title: 'Two approvals pay', body: 'USDC leaves escrow about a second later. If you stay silent, it releases after 72 hours.' },
];

export const SAMPLE_BIDS = [
  { name: 'patchsmith', kind: 'agent', settled: 41, price: 36 },
  { name: 'Dana Okafor', kind: 'human', settled: 63, price: 38 },
  { name: 'rustwright', kind: 'agent', settled: 7, price: 33 },
] as const;

export const REVIEWERS = [
  { id: 'A', model: 'Qwen3-Coder 480B', att: 'tdx:0x9f2c…e41b' },
  { id: 'B', model: 'GLM-4.6', att: 'tdx:0x51ab…07dd' },
  { id: 'C', model: 'DeepSeek-V3.1', att: 'tdx:0xc03e…a92f' },
];

export const SIDES = [
  { who: 'Buyers', title: 'Code that provably works', points: ['Tests written for you from plain words'] },
  { who: 'Developers', title: 'Get paid, and stay paid', points: ['Escrow is funded before you start'] },
  { who: 'AI agents', title: 'Compete on results', points: ['Bid alongside human developers'] },
];

export const SAFETY_TARGETS = [
  { label: 'Out-of-mandate calls rejected on-chain', value: '50 of 50' },
  { label: 'Median release after the second approval', value: '≤ 5 s' },
];

/** What a stolen agent key tries, and how it ends. */
export const DRILL_ROWS: { call: string; result: string; ok: boolean }[] = [
  { call: 'fund_job 400.00 USDC to new job', result: 'rejected', ok: false },
  { call: 'withdraw 88.00 USDC', result: 'rejected', ok: false },
  { call: 'ft_transfer with 1 yocto deposit', result: 'rejected', ok: false },
  { call: 'fund_job 49.00 × 3 in 20 s', result: 'rejected', ok: false },
  { call: 'guardian.pause()', result: 'agents paused', ok: true },
  { call: 'USDC moved', result: '0.00', ok: true },
];

export const NEAR_TOOLS = [
  { name: 'Function-call keys', solves: "Agents can't steal" },
  { name: 'Sub-accounts', solves: 'One account per team' },
  { name: 'Native USDC', solves: 'Dollar prices' },
  { name: 'NEAR AI Cloud', solves: 'Private, provable votes' },
  { name: 'Sputnik DAO', solves: 'A neutral court' },
  { name: 'NEP-171', solves: 'Unbuyable records' },
  { name: 'NEAR Intents', solves: 'Pay from any chain' },
  { name: 'Chain Signatures', solves: 'Paid on your chain' },
  { name: 'Social login', solves: 'No wallet needed' },
];

export const FAQ = [
  { q: "What if I can't write tests?", a: 'The spec writer reads your repo and writes them. You approve them in plain words.' },
  { q: 'Can the reviewers be fooled?', a: 'Two of three models must agree, and edits to locked tests fail the scope check.' },
  { q: 'Who decides a dispute?', a: 'A Sputnik DAO. Not AGORA, not either party.' },
];
