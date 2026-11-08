# agora-market contract interface

Owner: Member A. This file is the contract between the Rust contract, A's `chain/` module, the indexer, and Members B, C and D. Method names, arguments and event names change only with notice to the whole team.

Status: Phase 0 draft, 2026-11-08. Implemented so far: `new`, `get_config`, `is_paused`.

## 1. Basics

| Item | Value |
|---|---|
| Network | NEAR testnet |
| Contract account | `agora-market.agora-testnet.testnet` (planned) |
| Money token | Testnet USDC (NEP-141), 6 decimals. Address set in `new(usdc_token)` |
| Amounts | `U128` strings in base units. `"32000000"` = 32.00 USDC |
| Ids | `job_id` and `bid_id` are `U64` strings, counted up from `"1"` |
| Time | Nanoseconds, `U64` strings (`env::block_timestamp`) |
| Day for the daily cap | Calendar day in UTC: `block_timestamp / 86_400_000_000_000` |
| Fee | 2% (`fee_bps = 200`) of each release, sent to the DAO account |
| Milestones | One per job for the hackathon (`milestone = 0`) |
| Storage | The contract pays storage from its own balance |
| One yocto | Methods marked "1y" need exactly 1 yoctoNEAR attached. A function-call key cannot attach a deposit, so agent keys can never call them |

## 2. Callers (roles)

| Role | Account | Key |
|---|---|---|
| owner | The user's account, e.g. `pogi.testnet` | Full-access (custodial on testnet for Google/email users) |
| transaction agent | `agents.<owner>` | Function-call key limited to the six job methods: `post_job`, `accept_offer`, `fund_job`, `refund_milestone`, `grant_attempt`, `rate` |
| guardian | `agents.<owner>` guardian key | Function-call key limited to `pause` |
| seller / bidding agent | Seller account or `agents.<seller>` | Function-call key: `place_bid`, `submit_delivery` |
| fraud oracle | `oracle.agora-testnet.testnet` | Set in config |
| reviewers | 3 fixed accounts for the demo | Set in config |
| DAO | Sputnik DAO account | Set in config |
| anyone | Any account | `refund_expired`, `rerun_review`, `finalize_default`, views |

The contract maps `agents.<owner>` to `<owner>`: a call from `agents.alice.testnet` acts for `alice.testnet`.

## 3. Methods

### Setup and money

| Method | Arguments | Caller | Rules |
|---|---|---|---|
| `new` (init) | `owner_id, usdc_token, dao_account` | Contract account | Once only |
| `set_reviewers` | `reviewers: [AccountId; 3]` | Config owner | 1y |
| `set_fraud_oracle` | `oracle_id` | Config owner | 1y |
| `ft_on_transfer` | `sender_id, amount, msg` | USDC contract only | `msg`: `"deposit"`, `"dispute_bond:<job_id>"` or `"starter_stake"`. Credits the sender's free balance. Returns `"0"` (keeps all) |
| `withdraw` | `amount` | Owner | 1y. Only free balance. Sends USDC with `ft_transfer` |

### Mandate and pause

| Method | Arguments | Caller | Rules |
|---|---|---|---|
| `set_mandate` | `per_job_cap, daily_cap, new_seller_cap, review_timeout_hours, categories: string[], strict: bool, approved_sellers: AccountId[]` | Owner | 1y. Emits `mandate_set` |
| `pause` | none | Owner or guardian key | Sets the owner's mandate to paused. Cannot unpause. Emits `paused` |
| `unpause` | none | Owner | 1y. Emits `unpaused` |

Mandate defaults (from the prototype Limits page): per-job cap 50 USDC, daily cap 120 USDC, new-seller cap 25 USDC for sellers with fewer than 3 settled jobs, review timeout 12 h, categories `rust, fe, tests`, strict off.

### Jobs

| Method | Arguments | Caller | Rules |
|---|---|---|---|
| `post_job` | `category, budget_hint, spec_hash, deadline` | Buyer or buyer's agent | Returns `job_id`. Emits `job_posted` |
| `place_bid` | `job_id, price, days` | Seller or bidding agent | Moves no money. Returns `bid_id`. Emits `bid_placed` |
| `set_bid_flags` | `job_id, bid_id, price_check_ok: bool, fraud_score: u8, held: bool` | Fraud oracle only | Emits `bid_flagged` |
| `accept_offer` | `job_id, bid_id, price, spec_hash, holdout_hash, attempts, deadline` | Buyer or buyer's agent | Seller must not be the buyer or the buyer's agent (self-dealing). Locks the terms. Emits `offer_accepted` |
| `fund_job` | `job_id` | Buyer or buyer's agent | Runs the nine checks (section 4), moves price from free balance to escrow, adds it to used today. Emits `job_funded` |
| `submit_delivery` | `job_id, commit_hash` | Hired seller or their agent | Uses one attempt. Assigns the three reviewers. Emits `delivery_submitted` |
| `vote` | `job_id, approve: bool, log_hash, attestation_hash` | Assigned reviewer only | One vote each. At 2 approvals: release price minus 2% to the seller, 2% to the DAO, update reputation. At 2 rejections: attempt failed. Emits `vote_cast`, then `milestone_released` and `reputation_updated` |
| `refund_expired` | `job_id` | Anyone | After the deadline. Returns unreleased escrow to the buyer. Cannot be blocked. Emits `milestone_refunded` |
| `rate` | `job_id, stars: u8` | Buyer or seller of a settled job | One rating per side |

### Disputes (Phase 4)

| Method | Arguments | Caller | Rules |
|---|---|---|---|
| `rerun_review` | `job_id` | Anyone, after 12 h or a split vote | Fresh reviewers, moves no money |
| `refund_milestone` | `job_id` | Buyer, after the last attempt fails | Emits `milestone_refunded` |
| `grant_attempt` | `job_id` | Buyer, after the last attempt fails | Adds one attempt |
| `open_dispute` | `job_id, reason` | Buyer or seller | Freezes the job. Emits `dispute_opened` |
| `escalate` | `job_id` | Buyer or seller | Needs a 5% bond (min 1 USDC) paid through `ft_on_transfer`. Opens a Sputnik proposal |
| `resolve_dispute` | `job_id, outcome: "release" or "refund" or "split", seller_share_bps` | DAO account only | Returns or forfeits the bond. Emits `dispute_resolved` |
| `finalize_default` | `job_id` | Anyone, 72 h after escalation | The re-check result stands |

### Views (free, no signature)

`get_config()`, `is_paused(account_id)`, `get_balance(account_id) -> { free, escrowed }`, `get_mandate(account_id)`, `get_used_today(account_id)`, `get_job(job_id)`, `get_bids(job_id)`, `get_votes(job_id)`, `get_reputation(account_id) -> { settled, disputes, rating_sum, rating_count }`.

## 4. The nine funding checks (`fund_job`)

Checked in this order. The first one that fails panics with the message shown, and no money moves.

| # | Check | Panic message |
|---|---|---|
| 1 | Not paused | `Paused` |
| 2 | Price within per-job cap | `Over per-job cap` |
| 3 | Used today plus price within daily cap (UTC day) | `Over daily cap` |
| 4 | Job category is in the mandate's categories | `Category not allowed` |
| 5 | Strict mode on: seller is on the approved list | `Seller not approved` |
| 6 | No high fraud flag on the bid | `Bid flagged` |
| 7 | Price check cleared (bid not held) | `Bid held by price check` |
| 8 | Seller with fewer than 3 settled jobs: price within new-seller cap | `Over new-seller cap` |
| 9 | Enough free balance | `Not enough free balance` |

Before the nine checks, `fund_job` also requires the caller to be the buyer or the buyer's agent and the job to be in the accepted state.

## 5. Events (NEP-297)

Every state change logs one line: `EVENT_JSON:{"standard":"agora","version":"1.0.0","event":"<name>","data":[{...}]}`. The indexer depends on these names and fields.

| Event | data fields |
|---|---|
| `deposited` | `account_id, amount, free` |
| `withdrawn` | `account_id, amount, free` |
| `withdraw_failed` | `account_id, amount, free` (the USDC transfer failed, so the amount is credited back) |
| `job_posted` | `job_id, buyer, category, budget_hint, spec_hash, deadline` |
| `bid_placed` | `job_id, bid_id, seller, price, days` |
| `bid_flagged` | `job_id, bid_id, price_check_ok, fraud_score, held` |
| `offer_accepted` | `job_id, bid_id, seller, price, spec_hash, holdout_hash, attempts, deadline` |
| `job_funded` | `job_id, buyer, amount, used_today` |
| `delivery_submitted` | `job_id, attempt, commit_hash, reviewers` |
| `vote_cast` | `job_id, reviewer, approve, log_hash, attestation_hash` |
| `milestone_released` | `job_id, seller, amount, fee` |
| `milestone_refunded` | `job_id, buyer, amount, reason` |
| `dispute_opened` | `job_id, opener, reason` |
| `dispute_resolved` | `job_id, outcome, seller_amount, buyer_amount` |
| `reputation_updated` | `account_id, settled, disputes, rating_avg` |
| `paused` | `account_id, by` |
| `unpaused` | `account_id` |
| `mandate_set` | `account_id, per_job_cap, daily_cap, new_seller_cap, categories, strict` |

## 6. `chain/` module exports (backend, for B, C and D)

The only way any backend module talks to the contract. Import from `src/chain/chain.service`. With `AGORA_CHAIN_MODE=mock` every function returns fake but well-formed results, so nobody waits for the deployed contract.

| Function | Returns | Used by |
|---|---|---|
| `callAs(role, accountId, method, args, deposit?)` signs and sends a call. `role`: `owner`, `transaction_agent`, `guardian`, `fraud_oracle`, `reviewer`, `platform` | `{ tx_hash, explorer_url, result }` | B (jobs, bids), C (deliveries, reviews), D (wallet, mandates) |
| `buildUnsignedTx(signerId, method, args, deposit?)` for linked wallets | `{ unsigned_tx_base64 }` | B, D |
| `view(method, args)` | Parsed JSON | Everyone |
| `createAccount(profileId)` makes `<name>.testnet`, `agents.<name>.testnet`, transaction-agent and guardian keys | `{ account_id, agents_account_id }` | B (sign-up) |
| `explorerTxUrl(txHash)`, `explorerAccountUrl(accountId)` | URL string | Everyone |

Mock results: `tx_hash` is `mock-<method>-<counter>`, `explorer_url` points at testnet explorer with that hash, and `view` returns the values in `chain/mock-state.ts`.