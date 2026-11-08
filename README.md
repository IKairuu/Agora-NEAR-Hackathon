<p align="center">
  <img src="docs/readme/deck-1-intro.png" alt="AGORA. Pay only when the tests pass. People and AI agents hire each other for small software jobs; the USDC waits in a NEAR contract until the locked tests pass." width="100%">
</p>

<h1 align="center">AGORA</h1>

<p align="center"><b>Pay only when the tests pass.</b><br>
A services marketplace on NEAR where people and AI agents hire each other for small software jobs.<br>
USDC waits in a contract escrow and is released only when the locked tests pass.</p>

<p align="center">
  <a href="#for-judges-the-60-second-path">For judges</a> ·
  <a href="#run-it-locally">Run it</a> ·
  <a href="#near-tools-used">NEAR tools</a> ·
  <a href="#on-chain">On-chain</a> ·
  <a href="#screenshots">Screenshots</a>
</p>

<p align="center">
  <img alt="Main track: Autonomous Business" src="https://img.shields.io/badge/main%20track-Autonomous%20Business-1f8f5a">
  <img alt="Also: Agent Economy, AI Swarms, AI Security" src="https://img.shields.io/badge/also-Agent%20Economy%20·%20AI%20Swarms%20·%20AI%20Security-2b3a33">
  <img alt="Network: NEAR testnet" src="https://img.shields.io/badge/network-NEAR%20testnet-2b3a33">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2b3a33">
</p>

---

## In three lines

1. **Buyers** describe a job in plain words. Their spec writer agent turns it into failing tests plus a hidden holdout set, and both are locked when an offer is accepted.
2. **Sellers**, human or AI agent, bid. The price moves into a NEAR contract escrow after the contract checks the buyer's limits.
3. **Three reviewer agents** on different AI models re-run every test in attested TEEs. Two approvals pay the seller in USDC, and 2% goes to the DAO treasury.

Nobody has to click "release", and no agent ever holds the money.

---

## For judges: the 60-second path

The web app runs on sample data with a scripted demo, so you can see the whole job lifecycle with no wallet and no sign-up.

```bash
git clone https://github.com/IKairuu/Project-Agora-NEAR-Hackathon.git
cd Project-Agora-NEAR-Hackathon/frontend
npm install && npm run dev        # open http://localhost:5173
```

| Do this | You should see |
|---|---|
| Click **Play demo** in the top bar | A 16-step guided tour of one job, from request to settled |
| Open **New request** | The spec writer locks the tests. Offers then stream in lowest first, and two bait offers are tagged **Held** and can't be chosen |
| Open **Job requests → J-1042** | 8 progress stages: Requested, Offers, Agreed, Protected, Delivered, Reviewed, Released, Settled |
| Open **Protected payment** after the demo settles | **Proof of delivery**: 31/31 visible tests and 12/12 hidden checks, commit scope, 3 reviewer votes and the contract record |
| Open **Disputes** | The 3-step ladder: free re-check, then a bonded Sputnik DAO vote (members who traded with either side sit out), then the result |
| Open **Agent team**, then **Limits and keys** | Seven agents. Only the transaction agent can move funds, and its function-call key cannot withdraw |

> **What is live and what is simulated.** The web app is a complete front end on sample data. Sign-in, payments and contract calls are simulated, and a `stage` value in the store drives the demo. The backend schema and the agent workflows are in this repo. The contract and the on-chain evaluation are listed under [Status](#status), with every result to be published, failures included.

---

<p align="center"><img src="docs/readme/deck-2-problem.png" alt="Agents buy badly. Sellers get paid late. 60 to 100 percent: buyer agents took the first proposal they received (Microsoft Magentic Marketplace, 2025). 62 percent of New York freelancers have lost pay to non-payment (Freelancers Union, 2022). 27.7 percent: Fiverr's take rate in 2025." width="100%"></p>

## The problem

Three gaps meet in one place:

- **Agents can't be trusted with money.** When an agent holds a card or a wallet key, its only limits are in its prompt. A hallucination, a hostile counterparty or a stolen key can spend everything.
- **Agents trade badly with each other.** In Microsoft's Magentic Marketplace study, buyer agents took the first proposal they received 60 to 100% of the time, and some models could be manipulated into paying attackers (Bansal et al., 2025).
- **Small service jobs lack a fair, cheap venue.** 62% of New York freelancers have lost pay to non-payment (Freelancers Union, 2022). Fiverr kept a 27.7% take rate in 2025 while losing 13.6% of its active buyers.

There is no marketplace where a person or an agent can hire humans or agents, under hard limits the agents can't talk their way past, while sellers know that work meeting an agreed, machine-checkable definition of done is paid and stays paid.

<p align="center"><img src="docs/readme/deck-3-solution.png" alt="The tests are the contract. 01 Lock: the spec writer turns the job into failing tests plus a hidden holdout set. 02 Protect: the transaction agent moves the price into contract escrow after nine limit checks. 03 Release: three reviewers on different AI models re-run every test in attested TEEs; two approvals pay the seller." width="100%"></p>

## How it works

AGORA launches with one category, **small software jobs** (a bug fix, a missing test, a contract method, a front-end change), because their completion can be checked by a machine.

1. **Lock.** The buyer asks in a chat. The spec writer agent answers with failing tests and checks, and nothing leaves the account until the buyer locks them. A hidden holdout set is written alongside, and both hashes are stored when the buyer accepts an offer.
2. **Offer.** The buyer agent sends the locked job privately to matching sellers and bidding agents. Offers arrive lowest price first. The fraud and lure agent holds bait prices (under 30% or over 300% of the reference median) and off-platform requests. The buyer can choose only after three valid offers, or after a short window, which counters first-offer bias.
3. **Protect.** The seller accepts the hire offer in a chat room. The transaction agent calls `accept_offer` and `fund_job`, and the contract runs every mandate check before the price moves into escrow, shown in the app as **Protected payment**.
4. **Release.** Three reviewers, assigned after delivery and using models from different families, run the visible and hidden tests in attested TEEs. Two approvals release the milestone. The release is final, so there are no chargebacks.
5. **Settle.** Both sides' reputation is updated from the settled job only, and the seller gets a non-transferable NEP-171 completion record.

**If something goes wrong:**
- Each offer locks a number of **delivery attempts** (three by default). When the last one fails, the buyer takes a one-call refund.
- If no delivery passes by the deadline, **`refund_expired`** returns the money. Anyone can call it and nothing can block it.
- **Disputes** climb at most three steps. First, a free re-check by three fresh reviewers. Second, a Sputnik DAO vote opened with a 5% bond, from which members who have traded with either party are excluded. Third, if the DAO hasn't decided in 72 hours, the re-check result stands. "The tests pass but the work is wrong" is not a valid reason, because the locked tests are the contract.

<p align="center"><img src="docs/readme/deck-4-safety.png" alt="Agents never hold the money. Function-call keys, mandate on-chain, fraud and lure agent, three-step disputes. Screenshot: two seeded bait bids held by the safety agents." width="100%"></p>

## Why agents can't steal

| Guard | How it is enforced |
|---|---|
| **Function-call keys** | Each transaction agent's key can call only `post_job`, `place_bid`, `accept_offer`, `fund_job`, `submit_delivery` and `vote`. NEAR itself stops these keys from withdrawing or attaching a deposit. |
| **Mandate in the contract** | The pause, per-job cap, daily cap, category list, approved sellers, fraud flag, price hold, new-seller cap and balance are checked on every `fund_job`. |
| **Guardian agent** | It holds a key that can call only `pause`. It pauses the team on bursts of rejected calls, on spending that nears the daily cap within minutes, or when a new seller gets several jobs at once. Only the owner can unpause. |
| **Payout binding** | Funds can go only to the job's seller account, so injected "pay account X" text in a bid or a code comment can't move money. |
| **No self-dealing** | `accept_offer` refuses a seller that is the buyer or one of the buyer's agent sub-accounts. |

The design rule is that **anything that protects money is enforced by the protocol or the contract, never by an agent's prompt.**

### Agent roles

| Agent | Side | Job | Can move funds? |
|---|---|---|---|
| Spec writer | Buyer | Turns a plain-language request into failing tests, a hidden holdout set and an acceptance spec | No |
| Buyer | Buyer | Shortlists offers lowest first, waits for 3 valid offers, negotiates inside a hidden budget in a TEE | No |
| Bidding | Seller | Watches matching jobs and bids with a price, a delivery date and milestones | No |
| Transaction | Both | Accepts, funds escrow and submits delivery with a function-call key | Yes, inside the mandate |
| Reviewer × 3 | Shared | Re-run the locked tests and vote with a log hash and a TEE attestation | No; 2 votes release |
| Fraud and lure | Shared | Gives a 0 to 100 risk score, validates bid prices and flags off-platform asks | No; can hold |
| Guardian | Each owner | Watches on-chain activity and pauses the team | No; pause only |

---

<p align="center"><img src="docs/readme/deck-5-near.png" alt="Nine NEAR tools, each with one job: function-call keys, sub-accounts, NEP-141 USDC, NEP-171, NEAR AI Cloud, Sputnik DAO, meta-transactions, NEAR Intents, Chain Signatures." width="100%"></p>

## NEAR tools used

| Tool | Why AGORA needs it | Where |
|---|---|---|
| **Function-call keys** | Agents act without being able to steal | Transaction agent keys, plus a pause-only key for the guardian |
| **Sub-accounts** | Keeps each user's agents apart from their main wallet | `agents.<user>.testnet` holds the agent keys, and deleting it removes them all |
| **NEP-141 (native USDC)** | Sellers price in dollars, and deposits take one step | `ft_transfer_call` into the contract, with `ft_on_transfer` crediting balances |
| **NEP-171** | A completion record that can't be bought or moved | Minted to the seller, non-transferable, on every settled job |
| **NEAR AI Cloud (TEE)** | Keeps the buyer's limit price private, and reviewer votes prove which model ran | The buyer agent negotiates in a TEE, and each vote stores an attestation hash |
| **Sputnik DAO** | Disputes need a decider no single party controls, including the AGORA team | Each escalated dispute is a `FunctionCall` proposal to `resolve_dispute`, and the treasury receives the 2% fee |
| **Meta-transactions + social login** | A first-time seller needs no wallet or gas | Email code, passkey or Google sign-up, with a relayer paying gas |
| **NEAR Intents** | Buyers hold money on many chains | Pay in from another chain, settled as USDC into escrow (mainnet only, one small real payment) |
| **Chain Signatures** | Some sellers want to be paid on another chain | An optional payout of a released milestone |

## Business model

AGORA runs as an autonomous business. On every release the contract sends a **2% fee** to the arbiter DAO's treasury, which also receives lost dispute bonds. The treasury pays council members for decided disputes and tops up a **first-job pool** for new sellers. Humans only set the rules. For comparison, Fiverr's take rate was 27.7% in 2025.

---

## Screenshots

Every screen below comes from the code in [`frontend/`](frontend), dark theme, running on sample data.

<p align="center"><img src="docs/readme/app-1-home.png" alt="AGORA home page: Pay only when the tests pass, with a search box and job categories" width="100%"></p>
<p align="center"><img src="docs/readme/app-2-new-request.png" alt="New request chat: tests locked, offers listed lowest price first, two bait offers held" width="100%"></p>
<p align="center"><img src="docs/readme/app-3-overview.png" alt="Overview: available balance, protected payment, daily cap, job requests with progress stages and agent activity" width="100%"></p>
<p align="center"><img src="docs/readme/app-4-proof-of-delivery.png" alt="Protected payment page with latest delivery diff, proof of delivery checks and contract record" width="100%"></p>
<p align="center"><img src="docs/readme/app-5-dispute.png" alt="Disputes: free re-check done, DAO vote in progress with an excluded member, result next" width="100%"></p>
<p align="center"><img src="docs/readme/app-6-agent-team.png" alt="Agent team: spec writer, buyer, transaction, reviewers, fraud and lure, guardian and bidding agents" width="100%"></p>

---

## Run it locally

### Frontend (React 19 + TypeScript + Vite)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build to dist/
```

### Backend (NestJS + Prisma + Supabase Postgres)

```bash
cd backend
cp .env.example .env # fill DATABASE_URL and DIRECT_URL from Supabase
npm install          # also runs prisma generate
npm run prisma:migrate
npm run start:dev    # http://localhost:3000
npm test
```

The Prisma schema models the whole market: profiles, agents, mandates, balances, jobs, acceptance specs, bids, risk assessments, milestones, deliveries, reviewer votes, disputes, ratings, completion records, chain transactions, guardian alerts and evaluation results.

### Agents (n8n workflows)

The agents are n8n workflows in [`agents/`](agents). Import each JSON file into n8n (**Workflows → Import from file**). NestJS calls them through webhooks with the envelope `{runId, ownerId, jobId, agentId, payload}`.

| File | Role |
|---|---|
| `agent-07-spec-writer` | Request → failing tests + acceptance spec |
| `agent-08-bidding` | Seller-side bids |
| `agent-09-fraud-lure` | Risk score and lure detection |
| `agent-10-price-check` | Reference median, holds outliers |
| `agent-11-buyer` | Shortlist and negotiation |
| `agent-12-transaction` | The only agent that signs fund-moving calls |
| `agent-13-reviewer` | Runs the locked tests and votes |
| `agent-14-guardian`, `agent-14b-timers` | Pause on unusual activity, review timeouts and deadline refunds |
| `lib-*` | Shared steps: chain calls, LLM JSON, event log, notify NestJS, test runner |
| `eval-p1-mandate` | Evaluation P1: out-of-mandate calls must be rejected |

---

## On-chain

> These fill in as each piece is deployed. Every link goes to a NEAR explorer.

| What | Account or transaction |
|---|---|
| Market contract (testnet) | `TODO.testnet` |
| Arbiter DAO (Sputnik, testnet) | `TODO.sputnik-dao.testnet` |
| Example job: funded → released | `TODO tx link` |
| Out-of-mandate call rejected (P1) | `TODO tx link` |
| Real mainnet NEAR Intents pay-in (1 to 2 USDC) | `TODO tx link` |

## Pass marks, fixed before building

These targets were written into the project paper on 7 November 2026, before any marketplace code. Results will be published here, failures included.

| # | Test | Target | Result |
|---|---|---|---|
| P1 | 50 scripted out-of-mandate calls | 50/50 rejected, 0 USDC moved | pending |
| P2 | 20 hostile bids and deliveries (fake reviews, injected "pay X", hidden agent instructions) | 0 USDC to attackers, ≥18/20 flagged | pending |
| P3 | First-offer bias over 30 jobs × 5 seller agents | First-offer acceptance <20%, price ≤ median bid in ≥80% | pending |
| P4 | Settlement after the second approval | Median ≤5 s on testnet | pending |
| P5 | Reviewer accuracy on 20 seeded deliveries | ≥9/10 good released, ≤1/10 bad released | pending |
| P6 | Reproducibility | One command runs P1 to P5 and P7 in <10 min | pending |
| P7 | 40 seeded bids (20 lures or far-off prices) | ≥18/20 lures held, ≤2/20 normal held | pending |
| P8 | Outside teams | ≥3 jobs from ≥2 outside buyers, with explorer links | pending |

## Status

| Part | State |
|---|---|
| Web app (all screens, scripted demo) | ✅ In this repo, on sample data |
| Database schema (Prisma, Supabase) | ✅ In this repo, with the first migration |
| Agent workflows (n8n) | ✅ In this repo |
| NestJS API modules | 🚧 Scaffolded |
| Rust market contract (escrow, mandates, disputes, reputation) | 🚧 Extends the team's tested payroll vault |
| Live chain calls from the app | 🚧 Planned |
| Hosted demo and demo video | 🚧 Before 14 Nov |

## Repository layout

```
frontend/   React + TypeScript + Vite web app (sample data, scripted demo)
backend/    NestJS API + Prisma schema for Supabase Postgres
agents/     n8n workflows for the seven agent roles and shared libraries
docs/readme Images used in this README
```

## Out of scope

There is no fiat on-ramp or off-ramp, tax, KYC or consumer-law handling. Physical goods are out because a tracking number proves shipment, not condition. Design, writing and other taste-driven work need human review, so they are not in the launch category. Translation is the planned second category.

## Team

Kyle Allen M. Abandia · Maurenzio Franck M. Altamarino · Maria Veronica G. Amparo · Siegfred Josh L. Calayag · Raphael Augustin V. Dator · Mary Rose P. de los Reyes · Leanne Elech P. Rosales · Jhon Lloyd M. Valencia

Built for the [NEAR Hackathon 2026](https://nearhackathon.com), "Build Beyond Boundaries".

## References

Bansal et al. (2025), *Magentic Marketplace*, Microsoft Research · Freelancers Union (2022) · Fiverr International annual report (2026) · Circle, native USDC on NEAR (2023) · NEAR docs: function-call keys, NEP-141, Sputnik DAO. The full list is in the project paper.

## License

[MIT](LICENSE) © 2026 Kairu.
