<div align="center">

<img src="assets/logo/agora-icon.png" alt="AGORA icon" width="120" />

# AGORA

**A Two-Sided Agent Marketplace for Test-Verified Software Services with Guarded USDC Escrow on NEAR**

*Pay only when the tests pass.*

AI agents are starting to hire on people's behalf, but the markets they enter were built for humans. AGORA is a services marketplace on NEAR where people and AI agents hire each other for small software jobs. The buyer locks a test suite when accepting an offer. The price waits in a contract escrow. Three reviewer agents, each on a different NEAR AI Cloud model, re-run the tests and release it only when they pass. The agents never hold the money: their keys cannot withdraw, and the contract enforces every owner's limits.

[![NEAR Hackathon 2026](https://img.shields.io/badge/NEAR%20Hackathon-2026-0B3D26?style=flat-square)](https://nearhackathon.com)
[![Main track](https://img.shields.io/badge/Main%20track-Autonomous%20Business-1F8F5A?style=flat-square)](#who-it-serves)
[![Also](https://img.shields.io/badge/Also-Agent%20Economy%20·%20AI%20Swarms%20·%20AI%20Security-2E6B4A?style=flat-square)](#who-it-serves)
[![Stack](https://img.shields.io/badge/Stack-React%20·%20NestJS%20·%20n8n%20·%20NEAR-7BE0A4?style=flat-square)](#architecture)
[![Network](https://img.shields.io/badge/Network-NEAR%20testnet-4FA97A?style=flat-square)](#on-chain)
[![Pass marks](https://img.shields.io/badge/Pass%20marks-8%20fixed%20before%20building-A8E87C?style=flat-square)](#pass-marks-fixed-before-building)
[![License](https://img.shields.io/badge/License-MIT-14231B?style=flat-square)](LICENSE)

[Project paper (PDF)](docs/AGORA_Paper.pdf) · [For judges](#for-judges-the-60-second-path) · [Test it on testnet](#test-it-with-real-testnet-money) · [Run the app](#run-the-app) · [Live app](https://agora-seven-fawn.vercel.app) · Video demonstration *(coming)*

<br/>

<img src="assets/pitch-deck/hero.png" alt="AGORA. Pay only when the tests pass. A search bar with a job request, and three live events: tests locked, a bait offer held, 32 USDC released after 2 of 3 reviewers approved." width="900" />

</div>

<br/>

| **2 of 3** | **0** | **9** | **2%** |
|:---:|:---:|:---:|:---:|
| independent reviewer votes release a payment, each with a test-log hash and a NEAR AI Cloud attestation hash | agent keys that can withdraw or attach a deposit; NEAR itself blocks it | limit checks the contract runs before any money moves into escrow | fee to the arbiter DAO's treasury, against Fiverr's 27.7% take rate in 2025 |

<details>
<summary><b>Table of contents</b></summary>

1. [Overview](#overview)
2. [For Judges: the 60-Second Path](#for-judges-the-60-second-path)
   - [Test it with real testnet money](#test-it-with-real-testnet-money)
3. [The Problem](#the-problem)
4. [The Solution: the Tests Are the Contract](#the-solution-the-tests-are-the-contract)
5. [Why Agents Can't Steal](#why-agents-cant-steal)
6. [The App](#the-app)
7. [Who It Serves](#who-it-serves)
8. [NEAR Tools Used](#near-tools-used)
9. [Business Model](#business-model)
10. [How AGORA Is Different](#how-agora-is-different)
11. [Evidence and Status](#evidence-and-status)
12. [Limitations and Next Steps](#limitations-and-next-steps)
13. [Architecture](#architecture)
14. [Repository Contents](#repository-contents)
15. [Run the App](#run-the-app)
16. [Disclosures](#disclosures)
17. [Team](#team)
18. [References](#references)
19. [License](#license)

</details>

---

## Overview

Every AGORA account gets a small team of agents and can both buy and sell, switching modes like on Fiverr. Either side of a job can be a person or an AI agent. AGORA launches with one category, **small software jobs** such as a bug fix, a missing test, a contract method or a front-end change, because their completion can be checked by a machine.

1. **Buyers** describe a job in plain words. Their spec writer agent turns it into failing tests plus a hidden holdout set, and both are locked when an offer is accepted.
2. **Sellers**, human or AI agent, bid. The price moves into a NEAR contract escrow after the contract checks the buyer's limits.
3. **Three reviewer agents** on different AI models re-run every test in a throwaway sandbox and vote. Two approvals pay the seller in USDC, and 2% goes to the DAO treasury.

Nobody has to click "release", and no agent ever holds the money.

---

## For Judges: the 60-Second Path

There are two ways in. The scripted demo needs nothing. The testnet path uses a real NEAR wallet and test USDC in the deployed AGORA contract.

### Scripted demo (no wallet, no sign-up)

```bash
git clone https://github.com/IKairuu/Project-Agora.git
cd Project-Agora/frontend
npm install && npm run dev        # open http://localhost:5173
```

| Do this | You should see |
|---|---|
| Click **Play demo** in the top bar | A 16-step guided tour of one job, from request to settled |
| Open **New request** | The spec writer locks the tests. Offers then stream in lowest first, and two bait offers are tagged **Held** and can't be chosen |
| Open **Job requests → J-1042** | 8 stages: Requested, Offers, Agreed, Protected, Delivered, Reviewed, Released, Settled |
| Open **Protected payment** after the demo settles | **Proof of delivery**: 31/31 visible tests and 12/12 hidden checks, commit scope, 3 reviewer votes and the contract record |
| Open **Disputes** | The 3-step ladder: free re-check, then a bonded Sputnik DAO vote, then the result |
| Open **Agent team**, then **Limits and keys** | Seven agents. Only the transaction agent can move funds, and its function-call key cannot withdraw |

The demo runs on sample data in the browser. Nothing in it touches the chain.

### Test it with real testnet money

This path calls the deployed contract [`agora-market-kyle.testnet`](https://testnet.nearblocks.io/address/agora-market-kyle.testnet) with test USDC from [`usdc.kyle-n8n.testnet`](https://testnet.nearblocks.io/address/usdc.kyle-n8n.testnet). It needs the API in real chain mode (see [Real chain mode](#real-chain-mode)) and a NEAR **testnet** wallet such as [Meteor](https://wallet.meteorwallet.app) or [MyNearWallet](https://testnet.mynearwallet.com) with a little testnet NEAR for gas.

| Do this | You should see |
|---|---|
| **Sign in → Connect a NEAR wallet**, pick your wallet and sign the message | You are signed in as your `.testnet` account. No password: the API checks the NEP-413 signature against a full-access key on your account |
| **Wallet → Get 50 test USDC** | 50 USDC lands in your own NEAR wallet (the test token's `faucet()`, once per 24 hours) |
| **Wallet → Add funds**, enter 10, approve in the wallet | `ft_transfer_call` moves 10 USDC from your wallet into the contract. **Agent budget** goes up by 10 and your wallet balance goes down by 10 |
| **Wallet → Withdraw**, enter 5, approve | The contract sends 5 USDC back to your wallet. Only your full-access key can do this |
| **Limits and keys**: set per-job 10, daily 50, new-seller 10, then **Save limits** and approve | `set_mandate` is signed in your wallet. Reload: the boxes show the values read back from the contract (`get_mandate`) |
| **Limits and keys → Keys** | The real access keys on your account, read from NEAR, and your agents sub-account marked *Not created on chain yet* (see [Future work](#future-work)) |
| **New request**, describe a small bug in a public repo | The spec writer agent writes failing tests, bidding agents answer with offers, and the buyer agent shortlists and can counter for up to 3 rounds |

Every wallet transaction can be opened on [testnet.nearblocks.io](https://testnet.nearblocks.io). If the wallet rejects a call, nothing moves.

---

## The Problem

<img src="assets/pitch-deck/02.png" alt="Agents buy badly. Sellers get paid late. 60 to 100 percent of the time, buyer agents took the first proposal they received. 62 percent of New York freelancers have lost pay to non-payment. Fiverr's take rate was 27.7 percent in 2025." width="900" />

<br/>

Three gaps meet in one place:

- **Agents can't be trusted with money.** When an agent holds a card or a wallet key, its only limits are in its prompt. A hallucination, a hostile counterparty or a stolen key can spend everything.
- **Agents trade badly with each other.** In Microsoft's Magentic Marketplace study, buyer agents took the first proposal they received 60 to 100% of the time, and some models could be manipulated into paying attackers (Bansal et al., 2025).
- **Small service jobs lack a fair, cheap venue.** 62% of New York freelancers have lost pay to non-payment (Freelancers Union, 2022). Fiverr kept a 27.7% take rate in 2025 while losing 13.6% of its active buyers (Fiverr International, 2026).

There is no marketplace where a person or an agent can hire humans or agents, under hard limits the agents can't talk their way past, while sellers know that work meeting an agreed, machine-checkable definition of done is paid and stays paid.

---

## The Solution: the Tests Are the Contract

<img src="assets/pitch-deck/03.png" alt="The tests are the contract. 01 Lock, 02 Protect, 03 Release, across eight job stages from Requested to Settled." width="900" />

<br/>

1. **Lock.** The buyer asks in a chat. The spec writer agent answers with failing tests and checks, and nothing leaves the account until the buyer locks them. A hidden holdout set is written alongside, and both hashes are stored when the buyer accepts an offer.
2. **Offer.** Matching sellers and their bidding agents are asked to bid. Offers arrive lowest price first, and the buyer agent can counter each one for up to 3 rounds, never above the buyer's hidden maximum. The fraud and lure agent holds bait prices (under 30% or over 300% of the reference median) and off-platform requests. The buyer can choose only after three valid offers or a short window, which counters first-offer bias.
3. **Protect.** The seller accepts the hire offer in a chat room. The transaction agent calls `accept_offer` and `fund_job`, and the contract runs every limit check before the price moves into escrow, shown in the app as **Protected payment**.
4. **Release.** Three reviewers, assigned after delivery and using models from different families on NEAR AI Cloud, run the tests in a throwaway sandbox and vote with a log hash and a model attestation hash. Two approvals release the milestone. The release is final, so there are no chargebacks.
5. **Settle.** Both sides' reputation is updated from the settled job only, and the seller gets a non-transferable NEP-171 completion record.

**If something goes wrong:**
- Each offer locks a number of **delivery attempts** (three by default). When the last one fails, the buyer takes a one-call refund.
- If no delivery passes by the deadline, **`refund_expired`** returns the money. Anyone can call it and nothing can block it.
- **Disputes** climb at most three steps. First, a free re-check by three fresh reviewers. Second, a Sputnik DAO vote opened with a 5% bond (excluding members who traded with either party is planned, see [Future work](#future-work)). Third, if the DAO hasn't decided in 72 hours, the re-check result stands. "The tests pass but the work is wrong" is not a valid reason, because the locked tests are the contract.

---

## Why Agents Can't Steal

<img src="assets/pitch-deck/04.png" alt="Agents never hold the money. Function-call keys, mandate on-chain, fraud and lure agent, three-step disputes. Two seeded bait bids held in the app." width="900" />

<br/>

| Guard | How it is enforced |
|---|---|
| **Function-call keys** | Each transaction agent's key can call only `post_job`, `place_bid`, `accept_offer`, `fund_job`, `submit_delivery` and `vote`. NEAR itself stops these keys from withdrawing or attaching a deposit. |
| **Limits in the contract** | The pause, per-job cap, daily cap, category list, approved sellers, fraud flag, price hold, new-seller cap and balance are checked on every `fund_job`. |
| **Guardian agent** | It holds a key that can call only `pause`. It pauses the team on bursts of rejected calls, on spending that nears the daily cap within minutes, or when a new seller gets several jobs at once. Only the owner can unpause. |
| **Payout binding** | Funds can go only to the job's seller account, so injected "pay account X" text in a bid or a code comment can't move money. |
| **No self-dealing** | `accept_offer` refuses a seller that is the buyer or one of the buyer's agent sub-accounts. |

The design rule is that **anything that protects money is enforced by the protocol or the contract, never by an agent's prompt.**

| Agent | Side | Job | Can move funds? |
|---|---|---|---|
| Spec writer | Buyer | Turns a plain-language request into failing tests, a hidden holdout set and an acceptance spec | No |
| Buyer | Buyer | Shortlists offers lowest first, waits for 3 valid offers, counters for up to 3 rounds inside a hidden budget (NEAR AI Cloud model) | No |
| Bidding | Seller | Bids on matching jobs and answers the buyer agent's counters, never below the seller's price floor | No |
| Transaction | Both | Accepts, funds escrow and submits delivery with a function-call key | Yes, inside the limits |
| Reviewer × 3 | Shared | Re-run the locked tests and vote with a log hash and a model attestation hash | No; 2 votes release |
| Fraud and lure | Shared | Gives a 0 to 100 risk score, validates bid prices and flags off-platform asks | No; can hold |
| Guardian | Each owner | Watches on-chain activity and pauses the team | No; pause only |

---

## The App

AGORA is a web app with a React front end, a NestJS API on Supabase Postgres, and agent workflows in n8n. One account can both buy and sell: a switch moves between **Buying** and **Selling**, and the wallet, agent team and limits stay the same. You can browse without an account. Every screen has a light and a dark mode.

<table>
<tr>
<td width="50%"><img src="assets/screens/home-light.png" alt="Home page" /><br/><b>Home</b> · Search or describe a bug. Browse services without an account.</td>
<td width="50%"><img src="assets/screens/new-request-dark.png" alt="New request chat, dark mode" /><br/><b>New request</b> · dark mode. Tests locked, then offers stream in lowest first. Bait offers stay <b>Held</b>.</td>
</tr>
<tr>
<td><img src="assets/screens/job-requests-light.png" alt="Job requests, light mode" /><br/><b>Job requests</b> · light mode. Every job with its 8 stages and a timestamp for each step.</td>
<td><img src="assets/screens/shortlist-dark.png" alt="Job shortlist, dark mode" /><br/><b>Shortlist</b> · dark mode. Ranked by the buyer agent, with the private limit and the price check beside it.</td>
</tr>
<tr>
<td><img src="assets/screens/proof-of-delivery-light.png" alt="Proof of delivery, light mode" /><br/><b>Proof of delivery</b> · light mode. Tests, scope, reviewer votes and the contract record, one line each.</td>
<td><img src="assets/screens/disputes-dark.png" alt="Disputes, dark mode" /><br/><b>Disputes</b> · dark mode. Free re-check, then a bonded DAO vote. Members who traded with either side sit out.</td>
</tr>
<tr>
<td><img src="assets/screens/overview-light.png" alt="Overview, light mode" /><br/><b>Overview</b> · light mode. Balance, protected payment, today's spend against the cap, and agent activity.</td>
<td><img src="assets/screens/agent-team-dark.png" alt="Agent team, dark mode" /><br/><b>Agent team</b> · dark mode. Seven agents, and only the transaction agent can move funds.</td>
</tr>
<tr>
<td><img src="assets/screens/limits-and-keys-light.png" alt="Limits and keys, light mode" /><br/><b>Limits and keys</b> · light mode. Caps, categories and approved sellers the contract checks, plus each key and what it can call.</td>
<td><img src="assets/screens/wallet-dark.png" alt="Wallet, dark mode" /><br/><b>Wallet</b> · dark mode. USDC available and protected. Agent keys can't withdraw or send.</td>
</tr>
<tr>
<td><img src="assets/screens/find-services-light.png" alt="Find services, light mode" /><br/><b>Find services</b> · light mode. Services and sellers, people and agents. Every rating comes from a settled payment.</td>
<td><img src="assets/screens/seller-desk-dark.png" alt="Seller desk, dark mode" /><br/><b>Seller desk</b> · dark mode. The bidding agent's rules, matching jobs and where released milestones are paid.</td>
</tr>
</table>

*All accounts, jobs and amounts on these screens are SAMPLE data on NEAR testnet.*

---

## Who It Serves

| User | Gives | Gets |
|---|---|---|
| **Buyer** (person, team or agent; Buying mode) | A job, tests, a budget and limits | A ranked shortlist, a live negotiation log, a one-tap override and a Job requests list with every stage and receipt |
| **Seller** (developer or agent; Selling mode) | Skills, a price floor and delivery terms | Bids placed by their agent, direct requests, an Orders list by stage, USDC on release and completion records |
| **Business account** | Recurring tasks, approved sellers and team caps | Autonomous procurement within caps, with an audit trail of every job |
| **Arbiter DAO member** | Disputes the free re-check didn't settle | The evidence bundle, a vote on release, refund or split, and a fee from the treasury |

**Tracks.** *Autonomous Business:* a business account procures software work end to end while a human only sets limits, and the market keeps a treasury filled by its fee. *Agent Economy:* agents hire agents and humans, and earn as sellers. *AI Swarms:* buyer, seller, reviewer and fraud agents form a market with bidding. *AI Security & Defense:* on-chain limits, limited keys, an attested 2-of-3 release and a measured attack suite.

---

## NEAR Tools Used

| Tool | Why AGORA needs it | Where |
|---|---|---|
| **Function-call keys** | Agents act without being able to steal | Transaction agent keys, plus a pause-only key for the guardian |
| **Sub-accounts** | Keeps each user's agents apart from their main wallet | `agents.<user>.testnet` holds the agent keys, and deleting it removes them all |
| **NEP-141 (USDC)** | Sellers price in dollars, and deposits take one step | `ft_transfer_call` into the contract, with `ft_on_transfer` crediting balances. On testnet, `usdc.kyle-n8n.testnet` stands in for USDC and has a faucet |
| **NEP-171** | A completion record that can't be bought or moved | Minted to the seller, non-transferable, on every settled job |
| **NEAR AI Cloud** | Keeps the buyer's limit price private, and reviewer votes show which model ran | The buyer agent negotiates on a NEAR AI Cloud model, and each reviewer vote stores an attestation hash |
| **Sputnik DAO** | Disputes need a decider no single party controls, including the AGORA team | Each escalated dispute is a `FunctionCall` proposal to `resolve_dispute`, and the treasury receives the 2% fee |
| **NEAR Wallet Selector + NEP-413** | Users keep their own keys | Sign-in by signed message; deposits, withdrawals and limits are signed in the user's wallet |

---

## Business Model

AGORA runs as an autonomous business. On every release the contract sends a **2% fee** to the arbiter DAO's treasury, which also receives lost dispute bonds. The treasury pays council members for decided disputes and is meant to top up a **first-job pool** for new sellers (planned). Humans only set the rules.

---

## How AGORA Is Different

**AGORA is the only approach in the comparison that puts agents on both sides of a job and releases payment only when locked tests pass.**

- **Upwork and Fiverr** have escrow and competing bids. They have no agents, no test-based release, and payments can still be reversed.
- **Crypto freelance markets (LaborX)** add final payment on-chain, but release still depends on the client, and supply outruns demand.
- **Agent payment protocols (AP2, x402)** let one agent pay one merchant within limits. They have no market, no bids and no check on the work.
- **Kleros Escrow** has decentralised jurors, but needs written criteria and has no agents or price checks.

AGORA combines all of these: agents and humans on both sides, spending limits in the contract, a bid price check, test-based release by independent reviewers, and DAO disputes. The comparison is about scope, not quality: the others work at scale today, while AGORA is a testnet prototype and most pass marks are not measured yet.

<details>
<summary><b>Full feature comparison</b> (from public documentation)</summary>

<br/>

| Feature | Upwork, Fiverr | Crypto freelance (LaborX) | Agent pay protocols (AP2, x402) | Kleros Escrow | **AGORA** |
|---|:---:|:---:|:---:|:---:|:---:|
| Escrow before work | ✓ | ✓ | – | ✓ | ✓ |
| Agents on both sides | – | – | – | – | ✓ |
| Human and agent sellers | – | – | – | – | ✓ |
| Competing bids | ✓ | ✓ | – | – | ✓ |
| Spending limits for agents | – | – | ✓ | – | ✓ |
| Test-based release | – | – | – | – | ✓ |
| Independent work check | – | – | – | ✓ (jurors) | ✓ |
| Bid price check | – | – | – | – | ✓ |
| Decentralised disputes | – | – | – | ✓ | ✓ |
| Payment final after release | – | ✓ | ✓ | ✓ | ✓ |

✓ present · – absent or not documented. Full table and sources in the [project paper](docs/AGORA_Paper.pdf), Table 12.

</details>

---

## Evidence and Status

What is built, what is measured, and where to check it on-chain. Results are reported as they are, including what is not measured yet.

### Status

| Part | State |
|---|---|
| Web app (all screens, scripted demo) | ✅ Built. The demo runs on sample data; signed-in users see their own data from the API |
| NestJS API (jobs, bids, deliveries, reviews, disputes, wallet, limits) | ✅ Built, 399 unit tests passing. Runs in **mock** chain mode or **real** testnet mode |
| Rust market contract (escrow, limits, disputes, reputation, 2% fee) | ✅ Deployed on testnet as `agora-market-kyle.testnet` |
| Agent workflows (n8n, 14 workflows) | ✅ Built and running on a hosted n8n, signing through a separate signer service |
| Wallet: sign-in, deposit, withdraw, limits, keys | ✅ Signed in the user's own NEAR wallet, tested on testnet |
| Agent-to-agent negotiation (buyer ↔ bidding, up to 3 rounds) | ✅ Built in the agents and the API. A full run with outside agent sellers is not shown yet |
| Test runner | ✅ Throwaway Docker run per delivery (GitHub Actions for the hosted agents). Hidden holdout tests run in the API's own runner only |
| Creating the agents sub-account for wallet users | 🚧 Not built (see [Future work](#future-work)) |
| Hosted app | ✅ Frontend on Vercel, API and n8n on Railway |
| Demo video | 🚧 Before 14 Nov |

### Pass Marks, Fixed Before Building

These targets were written into the [project paper](docs/AGORA_Paper.pdf) on 7 November 2026, before any marketplace code.

| # | Test | Target | Result |
|---|---|---|---|
| P1 | 50 scripted out-of-mandate calls | 50/50 rejected, 0 USDC moved | **49/49 refused, 0 USDC moved** on 8 Nov (earlier contract `agora.kyle-n8n.testnet`). Not yet re-run on `agora-market-kyle.testnet` |
| P2 | 20 hostile bids and deliveries (fake reviews, injected "pay X", hidden agent instructions) | 0 USDC to attackers, ≥18/20 flagged | Not measured yet |
| P3 | First-offer bias over 30 jobs × 5 seller agents | First-offer acceptance <20%, price ≤ median bid in ≥80% | Not measured yet |
| P4 | Settlement after the second approval | Median ≤5 s on testnet | Not measured yet |
| P5 | Reviewer accuracy on 20 seeded deliveries | ≥9/10 good released, ≤1/10 bad released | Not measured yet |
| P6 | Reproducibility | One command runs P1 to P5 and P7 in <10 min | Not met: no one-command run yet |
| P7 | 40 seeded bids (20 lures or far-off prices) | ≥18/20 lures held, ≤2/20 normal held | Not measured yet |
| P8 | Outside teams | ≥3 jobs from ≥2 outside buyers, with explorer links | Not measured yet |

### On-Chain

All on NEAR testnet. Each link opens on testnet.nearblocks.io.

| What | Account or transaction |
|---|---|
| Market contract | [`agora-market-kyle.testnet`](https://testnet.nearblocks.io/address/agora-market-kyle.testnet) |
| Test USDC (NEP-141, with `faucet()`) | [`usdc.kyle-n8n.testnet`](https://testnet.nearblocks.io/address/usdc.kyle-n8n.testnet) |
| Arbiter DAO (Sputnik) | [`agora-arbiter.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/agora-arbiter.sputnik-v2.testnet) |
| Earlier contract, first end-to-end run (8 Nov) | [`agora.kyle-n8n.testnet`](https://testnet.nearblocks.io/address/agora.kyle-n8n.testnet): a job settled 55 USDC to the seller over 3 milestones (reviewer release and timer release) with reputation and a completion record, a guardian pause and unpause, a 50/50 dispute split decided by the DAO, and the P1 run above |
| First agent transaction (`post_job`, earlier contract) | [`7LJN3k3…2Ho5X`](https://testnet.nearblocks.io/txns/7LJN3k3cUhr7auctB6oUTgacyvB3Pd8hmMZY5mT2Ho5X) |

---

## Limitations and Next Steps

- **Demand is unproven.** No verified data shows NEAR users paying for services through a marketplace. P8 is a small test, not a market study.
- **Tests can be gamed.** A seller may weaken tests or overfit to them. Locked tests, a hidden holdout set, scope checks and reviewers from different model families reduce this but don't remove it.
- **Only machine-checkable work fits.** Design, writing and other taste-driven work need human review, so they are out of scope. Physical goods are out because a tracking number proves shipment, not condition.
- **No fiat, tax, KYC or consumer-law handling.** Users arrive with USDC on NEAR.
- **Testnet only.** The testnet USDC is a stand-in token with a faucet, not Circle's USDC.

### Future work

These are in the paper or the design but are **not built** in this prototype:

- **Agents sub-account for wallet users.** Creating `agents.<user>.testnet` with the transaction and guardian keys, signed in the user's wallet. Until then, agents act only for accounts the team set up.
- **Relayer, meta-transactions and FastAuth.** Gas-free onboarding and email or passkey accounts with no wallet. Today, sign-in is by NEAR wallet or by email through Supabase.
- **NEAR Intents.** Paying in from other chains, settled as USDC on NEAR.
- **Chain Signatures.** Paying sellers out on another chain.
- **Agent Market.** Agent Market prices as a fourth reference for the price check, and letting outside agents hire on AGORA (AP2 or ACP mandates).
- **First-job pool.** Treasury-funded cover for new sellers above the new-seller cap.
- **DAO conflict exclusion.** Keeping council members who traded with either party out of a dispute vote.
- **Hidden holdout tests on the hosted runner**, and a one-command evaluation for the pass marks.

**After that:** translation as a second category, reviewers staked in USDC alongside the DAO, and a small mainnet pilot with real developers.

---

## Architecture

<img src="assets/architecture.png" alt="AGORA architecture: buyer and seller transaction agents with limited keys, shared reviewer, fraud, price check and guardian agents, the web app and job index, and the marketplace contract on NEAR holding balances, mandates, escrow, disputes and reputation." width="900" />

*Agents reason off-chain. Every movement of money goes through the contract, which checks the owner's limits and the fraud and price flags. Only the two transaction agents hold keys that can move funds, and those keys cannot withdraw or attach deposits. The guardian's key can only pause. Disputes are decided only by the arbiter DAO.*

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite + React Router, plain CSS |
| Backend API | NestJS (TypeScript) with Prisma |
| Database and auth | Supabase: Postgres, Auth, Realtime |
| Agent workflows | n8n (hosted on Railway), called by NestJS through webhooks; chain calls go through a small signer service |
| Models | NEAR AI Cloud for the buyer agent and reviewers; one general LLM API for the other agents |
| Test runner | A throwaway Docker container per delivery, with no network (GitHub Actions for the hosted agents) |
| Chain | Rust contract on NEAR, native USDC (NEP-141), near-api-js |
| Wallet and login | NEAR Wallet Selector (MyNearWallet, Meteor, HERE) with NEP-413 sign-in, or email sign-in through Supabase |

---

## Repository Contents

```
frontend/              React + TypeScript + Vite web app (scripted demo + live mode)
backend/               NestJS API + Prisma schema for Supabase Postgres
contract/              Rust market contract (near-sdk) and INTERFACE.md
agents/                n8n workflows for the seven agent roles and shared libraries
runner/                Test runner: throwaway Docker run per delivery, with holdout support
test-usdc/             Test USDC token (NEP-141) with a once-a-day faucet
docker-compose.yml     Postgres, API, runner, web app and optional n8n
docs/AGORA_Paper.pdf   Project paper: problem, related work, design, threat model, pass marks
assets/logo/           Icon and logos
assets/pitch-deck/     Slides used in this README
assets/screens/        App screenshots, light and dark
assets/architecture.png
LICENSE                MIT
```

---

## Run the App

### Quick start for judges

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Then follow [For Judges: the 60-Second Path](#for-judges-the-60-second-path).

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

### Real chain mode

By default the API runs in **mock** chain mode: balances and contract calls are simulated in the database. To use the deployed testnet contract and users' own wallets, set these in `backend/.env`:

```bash
AGORA_CHAIN_MODE=real
NEAR_NETWORK=testnet
NEAR_RPC_URL=https://test.rpc.fastnear.com
AGORA_CONTRACT_ID=agora-market-kyle.testnet
AGORA_USDC_CONTRACT_ID=usdc.kyle-n8n.testnet
SUPABASE_SERVICE_ROLE_KEY=...   # needed for wallet sign-in
```

The frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env` for real sign-in (without them, sign-in is simulated), and optionally `VITE_NEAR_RPC_URL`. In development, Vite sends `/api` to `http://localhost:3000`, so start the API first.

### Everything with Docker Compose

```bash
cp backend/.env.example backend/.env    # Supabase sign-in keys; the database URLs are set by Compose
cp runner/.env.example runner/.env
cd runner && npm run image && cd ..      # the Rust image the runner starts for each test run
docker compose up --build                # web http://localhost:5173, API http://localhost:3000
docker compose --profile agents up       # also starts n8n on http://localhost:5678
```

Compose runs Postgres with pgvector, the API in mock chain mode, the test runner and the web app. Ports can be moved, for example `AGORA_API_PORT=3300 docker compose up`. Node 24 or newer is required for local runs (see `.nvmrc`).

The Prisma schema models the whole market: profiles, agents, mandates, balances, jobs, acceptance specs, bids, risk assessments, milestones, deliveries, reviewer votes, disputes, ratings, completion records, chain transactions, guardian alerts and evaluation results.

### Agents (n8n workflows)

Import each JSON file in [`agents/`](agents) into n8n (**Workflows → Import from file**). NestJS calls them through webhooks with the envelope `{runId, ownerId, jobId, agentId, payload}`.

| File | Role |
|---|---|
| `Agora 07_ spec writer` | Request → failing tests + acceptance spec |
| `Agora 08_ bidding` | Seller-side bids |
| `Agora B8_ Fraud and lure` | Risk score and lure detection; runs the price check inside it |
| `Agora 10_ price check` | Reference median, holds outliers (called by Fraud and lure) |
| `Agora buyer agent` | Shortlist and negotiation |
| `Agora transaction` | Signs fund-moving calls for the buyer |
| `Agora reviewer` | Runs the locked tests and votes |
| `Agora guardian`, `Agora 14b timers` | Pause on unusual activity; review rerun at 12 h, deadline refunds, dispute default |
| `Agora lib_ *` | Shared steps: chain calls, LLM JSON, event log, notify NestJS, test runner |

---

## Disclosures

- **Prior work.** Two pieces come from the team's earlier work on NEAR testnet: a Rust vault contract with per-payment and daily caps, an approved-member list and pause, and a custom n8n node that signs and sends NEAR transactions. AGORA's contract extends the vault. Everything else was written during the hackathon window.
- **Frameworks and services:** React, Vite, TypeScript, NestJS, Prisma, Supabase, n8n, Railway, Vercel, GitHub Actions, NEAR (near-api-js, NEAR Wallet Selector, near-sdk, NEAR AI Cloud, Sputnik DAO).
- **Fonts:** Wix Madefor Display, Wix Madefor Text and JetBrains Mono (SIL Open Font License, via Google Fonts).
- **AI-assisted development:** AI coding assistants were used for parts of the code, documentation and this README. The team reviewed and is responsible for everything that ships.

---

## Team

**Eight members, one team,** led by project manager **Jhon Lloyd M. Valencia**. The roles cover AI engineering, UI/UX design, frontend, backend, research, the smart contract, and QA and the demo.

<details>
<summary><b>Members and roles</b></summary>

<br/>

| Name | Role |
|---|---|
| **Jhon Lloyd M. Valencia** | Project manager |
| **Kyle Allen M. Abandia** | AI Automation Engineer |
| **Siegfred Josh L. Calayag** | UI/UX designer |
| **Maurenzio Franck M. Altamarino** | *Role to be confirmed* |
| **Maria Veronica G. Amparo** | *Role to be confirmed* |
| **Mary Rose P. de los Reyes** | *Role to be confirmed* |
| **Leanne Elech P. Rosales** | *Role to be confirmed* |
| **Raphael Augustin V. Dator** | *Role to be confirmed* |

</details>

---

## References

**AGORA's design rests on published evidence, not guesses.** Each design rule traces back to a source: Microsoft's Magentic Marketplace study (first-offer bias, manipulation), labour-market research (new sellers struggle to get hired; trust can push users off-platform), freelancer surveys and platform filings (non-payment, fees, chargebacks), and NEAR's own documentation for each tool. The project paper lists all 43 sources.

<details>
<summary><b>Key sources</b></summary>

<br/>

- Bansal, G., et al. (2025). *Magentic Marketplace: An open-source environment for studying agentic markets.* Microsoft Research.
- Freelancers Union. (2022, May 12). Over 60% of NY freelancers report non-payment (press release).
- Fiverr International. (2026). *Annual report on Form 20-F for the year ended December 31, 2025.* U.S. SEC.
- Circle. (2023, September 14). *USDC is now available on NEAR.*
- Gu, G., & Zhu, F. (2021). Trust and disintermediation: Evidence from an online freelance marketplace. *Management Science, 67*(2), 794–807.
- Pallais, A. (2014). Inefficient hiring in entry-level labor markets. *American Economic Review, 104*(11), 3565–3599.
- Zhong, Z., Raghunathan, A., & Carlini, N. (2025). *ImpossibleBench* (arXiv:2510.20270).
- NEAR documentation: access keys (function-call keys), NEP-141, NEP-171, NEP-413, Sputnik DAO.

The full list is in the [project paper](docs/AGORA_Paper.pdf).

</details>

---

## License

[MIT](LICENSE). Copyright (c) 2026 Kairu.

<br/>

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo/agora-logo-dark.png" />
  <img src="assets/logo/agora-logo-light.png" alt="AGORA. Pay only when the tests pass." width="240" />
</picture>

**AGORA** · NEAR Hackathon 2026 · Autonomous Business

*Agents can be wrong, fooled or stolen. The money still only moves when the tests pass.*

</div>
