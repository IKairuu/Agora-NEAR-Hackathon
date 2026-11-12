/*
 * App data and UI vocabulary.
 *
 * No records are defined here. The containers below start empty and are filled from the backend
 * (lib/live.ts, loadAppData and goLive): the market (services, sellers, open jobs) from its public
 * endpoints, and the scripted "Play demo" story from GET /api/demo/v1. Screens read these objects
 * directly, so they are filled in place and never replaced.
 *
 * What stays in the frontend is UI wording and settings: labels, filter options, form choices and
 * the landing page's illustration copy.
 */
import type { IconName } from '../ui/icons';

/* ---------------- record types ---------------- */
export interface Bid {
  key: string; name: string; acct: string; kind: 'agent' | 'human'; owner: string;
  price: number; final: number; days: string; fraud: number; settled: number; buyers: number;
  pass: string; disputes: number; note: string; newSeller?: boolean;
  /** Delivery attempts this seller offers; ATT when missing. */
  attempts?: number;
}
/** An offer the fraud and lure agent holds back. */
export interface HeldBid { name: string; acct: string; kind: 'agent' | 'human'; price: number; fraud: number; why: string; text: string }
export interface Reviewer { id: string; model: string; att: string }
/** A job request on the Job requests page. `at` is the current lifecycle node, `grp` the filter group, `ev` the activity log. */
export interface OtherJob {
  id: string; title: string; cat: string; budget: string; status: [string, string]; who: string; note?: string;
  due?: string; at?: number; grp?: string; ev?: [string, string, string][]; href?: string; posted?: boolean;
  /** Live: what the buyer may do to take the job away, as the API decides (a draft is deleted, an open job cancelled). */
  remove?: 'delete' | 'cancel' | null;
}
export interface Order { id: string; buyer: string; title: string; cat: string; price: string; st: number; note: string }
export type ThreadFrom = 'agent' | 'them' | 'me' | 'sys';
/** A sample inbox thread around the demo job: key into T_MSGS, the other party, its job and amount. */
export interface DemoThread { k: string; who: string; ag?: boolean; job: string; amt: string; unread?: boolean }
/** The sellers directory. */
export interface SellerDir {
  key: string; name: string; initials: string; kind: 'agent' | 'human'; level: string; rating: number; settled: number; buyers: number;
  pass: number; volume: number; from: number; acct: string; about: string; langs: string; online: boolean; gig: string; days: number;
  /* what the seller wrote in their seller profile (live API; empty in the demo directory) */
  headline?: string; country?: string; skills?: string[]; categories?: string[]; terms?: string; github?: string;
}
export type ThumbKind = 'test' | 'contract' | 'coverage' | 'browser' | 'csv' | 'upgrade' | 'diff' | 'audit';
export interface Gig {
  id: string; thumb: ThumbKind; tone: 'night' | 'paper' | 'grad'; seller: string; initials: string;
  kind: 'agent' | 'human'; level: string; title: string; rating: number; count: number;
  from: number; days: number; cat: string; online: boolean; prompt: string;
  /** The seller's account, for their reputation. */
  sellerKey?: string;
}
/** Open jobs shown to sellers. [title, cats, budget, check, bids, buyer, visible, blurb, buyer rating, minutes ago] */
export type OpenJob = [string, string, string, string, number, string, boolean, string, string, number];

/** Everything GET /api/demo/v1 returns. */
export interface DemoData {
  me: typeof ME; job: typeof JOB; spec: [string, string, string][]; bids: Bid[]; held: HeldBid[]; reviewers: Reviewer[];
  replies: Record<string, string>; otherJobs: OtherJob[]; doneJobs: OtherJob[]; arrive: string[];
  kickoff: Record<string, string>; kickoffDefault: string; orders: Order[]; jobListing: typeof JOB_LISTING;
  threads: DemoThread[]; threadMessages: Record<string, [ThreadFrom, string][]>; threadTimes: Record<string, string>;
  negotiationLog: [string, string, string, string][]; daoCouncil: CouncilMember[]; settled: typeof SETTLED;
}
export interface CouncilMember { key: string; acct: string; role: string; recused: boolean }

/* ---------------- containers, filled from the backend ---------------- */
/** The account shown in the shell: the demo buyer, or the real account once signed in. */
export const ME = { name: '', acct: '', agents: '', initials: '', email: '' };
/** The job the demo tour follows, or the job the signed-in user is working on. */
export const JOB = { id: '', title: '', repo: '', base: '', cat: '', plain: '', posted: '', specHash: '' };
/** How the demo job shows on Open jobs once it is posted. */
export const JOB_LISTING = { budget: '', check: '', blurb: '', buyerRating: '' };
export const SPEC: [string, string, string][] = [];
export const BIDS: Bid[] = [];
export const sellerBy = (key: string) => BIDS.find((b) => b.key === key);
/** The buyer agent's pick: the offer it negotiated down (its negotiated `final` is below the listed price). */
export const agentPick = () => BIDS.find((b) => b.final < b.price);
export const HELD: HeldBid[] = [];
export const REVIEWERS: Reviewer[] = [];
/** The hired seller's reply to the buyer's first message, by seller key. */
export const REPLIES: Record<string, string> = {};
export const OTHER_JOBS: OtherJob[] = [];
/** Finished job requests, shown compact under the ongoing ones. */
export const DONE_JOBS: OtherJob[] = [];
/** Arrival order of offers on the demo job. Held ones are tagged by the fraud and lure agent and can't be chosen. */
export const ARRIVE: string[] = [];
/** After the seller accepts they write first, by seller key; `''` holds the fallback message. */
export const KICKOFF: Record<string, string> = {};
export const SELLERS_DIR: SellerDir[] = [];
export const sellerDir = (k: string): SellerDir | undefined => SELLERS_DIR.find((s) => s.key === k || s.name === k) || SELLERS_DIR[0];
/** Seller name to directory key, for clickable names. */
export const dirKey = (name: string) => SELLERS_DIR.find((x) => x.name === name)?.key;
/** Seller orders for the demo. Stages follow the job flow: offer, accept and fund, deliver, 2 of 3 reviewers, release. */
export const ORDERS: Order[] = [];
export const THREADS: DemoThread[] = [];
export const T_MSGS: Record<string, [ThreadFrom, string][]> = {};
export const T_TIME: Record<string, string> = {};
export const GIGS: Gig[] = [];
export const gigBy = (id: string) => GIGS.find((x) => x.id === id);
/** The buyer agent's negotiation log on the demo job: [time, who, tone, text]. */
export const NEG_LOG: [string, string, string, string][] = [];
/** Arbiters on the demo's example dispute. */
export const DAO_COUNCIL: CouncilMember[] = [];
/** The completion record and review the hired seller earns when the demo job settles. */
export const SETTLED = { record: '', title: '', reviewer: '', review: '' };
/** Open jobs from GET /api/open-jobs/v1. */
export const OPEN_JOBS: OpenJob[] = [];

/** Open jobs for sellers. In the demo, the demo job leads the list once it is posted. */
let liveOpen: { jobs: OpenJob[]; refs: string[] } | null = null;
/** Signed in for real, Open jobs come from the account's view of the API. */
export const setLiveOpenJobs = (v: { jobs: OpenJob[]; refs: string[] } | null) => { liveOpen = v; };
/** The job id behind row i of the live Open jobs list. */
export const liveOpenRef = (i: number): string | undefined => liveOpen?.refs[i];
export const openJobs = (stage: number): OpenJob[] => liveOpen ? liveOpen.jobs : [
  ...(JOB.id && stage >= 2 ? [[JOB.title, JOB.cat, JOB_LISTING.budget, JOB_LISTING.check, stage >= 3 ? 6 : 0, ME.name, true, JOB_LISTING.blurb, JOB_LISTING.buyerRating, 3] as OpenJob] : []),
  ...OPEN_JOBS,
].filter((j) => j[6]);

/* ---------------- UI wording and settings ---------------- */
/** The eight lifecycle nodes. */
export const LIFE = ['Requested', 'Offers', 'Agreed', 'Protected', 'Delivered', 'Reviewed', 'Released', 'Settled'];
/** Job requests filter pills. */
export const JF: [string, string][] = [['all', 'All'], ['offers', 'Getting offers'], ['waiting', 'Waiting on seller'], ['working', 'In progress'], ['done', 'Completed'], ['disputed', 'Disputed']];
/** Delivery attempts allowed per job. */
export const ATT = 3;
export const O_ST: [string, string][] = [['info', 'Incoming'], ['', 'Offer sent'], ['acc', 'Payment protected'], ['hold', 'Reviewers voting'], ['ok', 'Paid']];

/** Landing page illustration: what a stolen agent key tries, and what stops it. */
export const ATTACK: [string, string, string][] = [
  ['fund_job 400.00 USDC to new job', 'Over per-job cap (50)', 'Contract'],
  ['fund_job 45.00 to drain-1.testnet', 'Seller not on approved list (strict mode)', 'Contract'],
  ['withdraw 88.00 USDC', 'Method not allowed for this key', 'Protocol'],
  ['ft_transfer with 1 yocto deposit', 'Function-call keys cannot attach deposits', 'Protocol'],
  ['fund_job 49.00 × 3 in 20 s', 'Over daily cap (120)', 'Contract'],
  ['place_bid on own fake job', 'Fraud flag: self-dealing', 'Contract'],
];

export const WALK: [string, string][] = [
  ['Describe the job', 'Your sentence becomes tests that fail today, locked with the job.'],
  ['Agents bid, lures are held', 'People and AI agents bid. Your buyer agent waits for three offers and holds anything that asks to skip escrow.'],
  ['Three reviewers vote', 'Each one runs the locked tests on the delivered commit inside an enclave and signs its vote.'],
  ['Two approvals pay', 'USDC leaves escrow about a second later. Nobody has to press release.'],
];

/** Search suggestions on the landing hero. */
export const HS: Record<'quick' | 'trend', string[]> = {
  quick: ['Fix a failing Rust test in my NEAR contract', 'Write unit tests until coverage reaches 90%', 'Fix my wallet modal on Safari'],
  trend: ['Migrate near-api-js v4 calls to v5', 'Add a paginated view method to my contract', 'Export NEP-141 token holders to CSV'],
};

export const HERO_CATS: [IconName, string, string][] = [
  ['code', 'Fix a failing test', 'Smart contracts'],
  ['flask', 'Write tests', 'Tests'],
  ['cube', 'Contract methods', 'Smart contracts'],
  ['window', 'Front-end fixes', 'Front-end'],
  ['term', 'Scripts and data', 'Scripts'],
];

export const FILTERS = {
  cat: ['All', 'Smart contracts', 'Front-end', 'Tests', 'Scripts'],
  who: ['Any seller', 'Developers', 'Coding agents', 'Top rated'],
  budget: ['Any budget', 'Under 20 USDC', '20 to 40 USDC', 'Over 40 USDC'],
  when: ['Any time', 'Within 1 day', 'Within 3 days'],
} as const;
export type FilterKey = keyof typeof FILTERS;

export const ROLES: ['hire' | 'work', IconName, string, string][] = [
  ['hire', 'brief', 'I want to hire', 'Post a code job and let your agents find, check and pay the right seller.'],
  ['work', 'code', 'I want to sell my coding work', 'Your bidding agent finds test-verified jobs. You get paid in USDC when the tests pass.'],
];
export const VIA: Record<string, string> = { google: 'Google', github: 'GitHub', email: 'email', wallet: 'your NEAR wallet', passkey: 'a passkey' };

export const SELL_STEPS = ['Your profile', 'Experience', 'Skills and pricing', 'Get paid', 'Review'];
export const SKILLS = ['Rust', 'NEAR SDK', 'NEP-141', 'TypeScript', 'React', 'Playwright', 'Tests', 'Python'];
export const CATS: [string, string][] = [['rust', 'Smart contracts'], ['fe', 'Front-end'], ['tests', 'Tests'], ['scripts', 'Scripts']];
export const PAYOUTS: [string, string][] = [['near', 'USDC on NEAR'], ['eth', 'USDC on Ethereum'], ['base', 'USDC on Base']];
export const COUNTRIES = ['Philippines', 'Nigeria', 'India', 'Brazil', 'Germany', 'United States', 'Japan', 'Kenya', 'Indonesia', 'Other'];

export const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
