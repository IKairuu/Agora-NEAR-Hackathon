/* Shapes of the demo dataset served by GET /api/demo/v1. They match what the frontend renders. */

export type Tone = [string, string];

export interface DemoBid {
    key: string; name: string; acct: string; kind: 'agent' | 'human'; owner: string;
    price: number; final: number; days: string; fraud: number; settled: number; buyers: number;
    pass: string; disputes: number; note: string; newSeller?: boolean;
    /** Delivery attempts this seller offers; 3 when missing. */
    attempts?: number;
}

export interface DemoHeld { name: string; acct: string; kind: 'agent' | 'human'; price: number; fraud: number; why: string; text: string }

export interface DemoJobRequest {
    id: string; title: string; cat: string; budget: string; status: Tone; who: string; note?: string;
    due?: string; at?: number; grp?: string; ev?: [string, string, string][]; href?: string; posted?: boolean;
}

export interface DemoOrder { id: string; buyer: string; title: string; cat: string; price: string; st: number; note: string }

export interface DemoData {
    /** The demo buyer account. */
    me: { name: string; acct: string; agents: string; initials: string; email: string };
    /** The job the tour follows. */
    job: { id: string; title: string; repo: string; base: string; cat: string; plain: string; posted: string; specHash: string };
    /** Acceptance checks: [check, how reviewers verify it, weight]. */
    spec: [string, string, string][];
    bids: DemoBid[];
    /** Offers the fraud and lure agent holds back. */
    held: DemoHeld[];
    reviewers: { id: string; model: string; att: string }[];
    /** The hired seller's reply to the buyer's first chat message, by seller key. */
    replies: Record<string, string>;
    otherJobs: DemoJobRequest[];
    doneJobs: DemoJobRequest[];
    /** Order in which offers arrive (bid keys and held names). */
    arrive: string[];
    /** The seller's first message after accepting, by seller key, and the fallback. */
    kickoff: Record<string, string>;
    kickoffDefault: string;
    /** How the demo job shows on Open jobs once posted. */
    jobListing: { budget: string; check: string; blurb: string; buyerRating: string };
    /** Sample inbox threads around the demo, keyed into threadMessages; title and status come from otherJobs. */
    threads: { k: string; who: string; ag?: boolean; job: string; amt: string; unread?: boolean }[];
    /** Seller-side orders. `st` is the stage: 0 incoming, 1 offer sent, 2 protected, 3 voting, 4 paid. */
    orders: DemoOrder[];
    /** Inbox threads other than the demo job, by thread key: [from, text]. */
    threadMessages: Record<string, ['agent' | 'them' | 'me' | 'sys', string][]>;
    threadTimes: Record<string, string>;
    /** The buyer agent's negotiation log on the demo job: [time, who, tone, text]. */
    negotiationLog: [string, string, string, string][];
    /** Arbiters on the example dispute; a recused member traded with one side before. */
    daoCouncil: { key: string; acct: string; role: string; recused: boolean }[];
    /** The completion record and review the hired seller earns when the demo job settles. */
    settled: { record: string; title: string; reviewer: string; review: string };
}
