use near_sdk::json_types::{Base64VecU8, U64, U128};
use near_sdk::serde_json::{Value, json};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue, assert_one_yocto, env, ext_contract, near, require,
};

const USDC: u128 = 1_000_000;
const MAX_BIDS_PER_JOB: usize = 20;
const MAX_OPEN_BIDS_PER_SELLER: u32 = 10;
const HIGH_FRAUD_SCORE: u8 = 70;
const NEW_SELLER_SETTLED_JOBS: u32 = 3;
const NANOS_PER_DAY: u64 = 86_400_000_000_000;
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_WITHDRAW_CALLBACK: Gas = Gas::from_tgas(10);
const GAS_FOR_ADD_PROPOSAL: Gas = Gas::from_tgas(30);
const GAS_FOR_PROPOSAL_CALLBACK: Gas = Gas::from_tgas(10);
const GAS_FOR_RESOLVE: u64 = 50_000_000_000_000;
const NANOS_PER_HOUR: u64 = 3_600_000_000_000;
const ESCALATION_WINDOW: u64 = 72 * NANOS_PER_HOUR;
const BOND_BPS: u128 = 500;
const MIN_BOND: u128 = USDC;
const STARTER_STAKE: u128 = 10 * USDC;
const STAKED_SELLER_CAP: u128 = 60 * USDC;
const MAX_REASON_LEN: usize = 500;
const DEFAULT_PROPOSAL_BOND: u128 = 100_000_000_000_000_000_000_000;

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Balances,
    Mandates,
    Sellers,
    OpenBids,
    Jobs,
    Bids,
    UsedToday,
    Reputations,
    Disputes,
    Stakes,
    Records,
    RecordsOf,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Config {
    pub owner_id: AccountId,
    pub usdc_token: AccountId,
    pub dao_account: AccountId,
    pub fee_bps: u16,
    pub fraud_oracle: Option<AccountId>,
    pub reviewers: Vec<AccountId>,
    pub proposal_bond: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub enum JobStage {
    Open,
    Accepted,
    Funded,
    Delivered,
    Released,
    Refunded,
    Disputed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Job {
    pub job_id: U64,
    pub buyer: AccountId,
    pub category: String,
    pub budget_hint: U128,
    pub spec_hash: String,
    pub deadline: U64,
    pub stage: JobStage,
    pub bid_ids: Vec<U64>,
    pub accepted_bid: Option<U64>,
    pub seller: Option<AccountId>,
    pub price: U128,
    pub holdout_hash: Option<String>,
    pub attempts_left: u8,
    pub attempt: u8,
    pub commit_hash: Option<String>,
    pub reviewers: Vec<AccountId>,
    pub votes: Vec<Vote>,
    pub delivered_at: U64,
    pub review_round: u8,
    pub buyer_rated: bool,
    pub seller_rated: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Dispute {
    pub job_id: U64,
    pub opened_by: AccountId,
    pub reason: String,
    pub opened_at: U64,
    pub recheck: Option<String>,
    pub recheck_at: Option<U64>,
    pub escalated_by: Option<AccountId>,
    pub escalated_at: Option<U64>,
    pub claim: Option<String>,
    pub bond: U128,
    pub proposal_id: Option<U64>,
    pub outcome: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Record {
    pub token_id: String,
    pub owner_id: AccountId,
    pub job_id: U64,
    pub amount: U128,
    pub issued_at: U64,
}

#[near(serializers = [json])]
pub struct TokenMetadata {
    pub title: String,
    pub description: String,
    pub issued_at: String,
    pub extra: String,
}

#[near(serializers = [json])]
pub struct Token {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
}

#[near(serializers = [json])]
pub struct ContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Vote {
    pub reviewer: AccountId,
    pub approve: bool,
    pub log_hash: String,
    pub attestation_hash: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Reputation {
    pub settled: u32,
    pub disputes: u32,
    pub rating_sum: u32,
    pub rating_count: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Bid {
    pub bid_id: U64,
    pub job_id: U64,
    pub seller: AccountId,
    pub price: U128,
    pub days: u32,
    pub price_check_ok: Option<bool>,
    pub fraud_score: u8,
    pub held: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Balance {
    pub free: U128,
    pub escrowed: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Mandate {
    pub per_job_cap: U128,
    pub daily_cap: U128,
    pub new_seller_cap: U128,
    pub review_timeout_hours: u32,
    pub categories: Vec<String>,
    pub strict: bool,
    pub approved_sellers: Vec<AccountId>,
    pub paused: bool,
}

impl Default for Mandate {
    fn default() -> Self {
        Self {
            per_job_cap: U128(50 * USDC),
            daily_cap: U128(120 * USDC),
            new_seller_cap: U128(25 * USDC),
            review_timeout_hours: 12,
            categories: vec!["rust".to_string(), "fe".to_string(), "tests".to_string()],
            strict: false,
            approved_sellers: vec![],
            paused: false,
        }
    }
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    config: Config,
    balances: LookupMap<AccountId, Balance>,
    mandates: LookupMap<AccountId, Mandate>,
    sellers: LookupSet<AccountId>,
    open_bids: LookupMap<AccountId, u32>,
    jobs: LookupMap<u64, Job>,
    bids: LookupMap<u64, Bid>,
    next_job_id: u64,
    next_bid_id: u64,
    used_today: LookupMap<AccountId, (u64, u128)>,
    reputations: LookupMap<AccountId, Reputation>,
    disputes: LookupMap<u64, Dispute>,
    stakes: LookupMap<AccountId, u128>,
    records: LookupMap<String, Record>,
    records_of: LookupMap<AccountId, Vec<String>>,
    next_record_id: u64,
}

pub fn is_agent(account_id: &AccountId) -> bool {
    account_id.as_str().starts_with("agents.")
}

pub fn owner_of(account_id: &AccountId) -> AccountId {
    match account_id.as_str().strip_prefix("agents.") {
        Some(owner) => owner.parse().unwrap(),
        None => account_id.clone(),
    }
}

impl Contract {
    fn credit(&mut self, account_id: &AccountId, amount: u128) {
        let mut balance = self.get_balance(account_id.clone());
        balance.free = U128(balance.free.0 + amount);
        self.balances.insert(account_id.clone(), balance);
    }

    fn release(&mut self, job: &mut Job) {
        let price = job.price.0;
        let fee = price * self.config.fee_bps as u128 / 10_000;
        let seller = job.seller.clone().unwrap();
        let mut buyer_balance = self.get_balance(job.buyer.clone());
        buyer_balance.escrowed = U128(buyer_balance.escrowed.0 - price);
        self.balances.insert(job.buyer.clone(), buyer_balance);
        self.credit(&seller, price - fee);
        let dao = self.config.dao_account.clone();
        self.credit(&dao, fee);
        job.stage = JobStage::Released;
        self.mint_record(&seller, job.job_id, price - fee);
        let mut rep = self.get_reputation(seller.clone());
        rep.settled += 1;
        self.reputations.insert(seller.clone(), rep.clone());
        emit(
            "milestone_released",
            json!({ "job_id": job.job_id, "seller": seller, "amount": U128(price - fee), "fee": U128(fee) }),
        );
        let rating_avg = if rep.rating_count == 0 {
            0.0
        } else {
            rep.rating_sum as f64 / rep.rating_count as f64
        };
        emit(
            "reputation_updated",
            json!({ "account_id": seller, "settled": rep.settled, "disputes": rep.disputes, "rating_avg": rating_avg }),
        );
    }

    fn require_config_owner(&self) {
        require!(
            env::predecessor_account_id() == self.config.owner_id,
            "Only the config owner"
        );
    }
}

fn emit(event: &str, data: Value) {
    let line = json!({
        "standard": "agora",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{}", line));
}

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn new(owner_id: AccountId, usdc_token: AccountId, dao_account: AccountId) -> Self {
        Self {
            config: Config {
                owner_id,
                usdc_token,
                dao_account,
                fee_bps: 200,
                fraud_oracle: None,
                reviewers: vec![],
                proposal_bond: U128(DEFAULT_PROPOSAL_BOND),
            },
            balances: LookupMap::new(StorageKey::Balances),
            mandates: LookupMap::new(StorageKey::Mandates),
            sellers: LookupSet::new(StorageKey::Sellers),
            open_bids: LookupMap::new(StorageKey::OpenBids),
            jobs: LookupMap::new(StorageKey::Jobs),
            bids: LookupMap::new(StorageKey::Bids),
            next_job_id: 1,
            next_bid_id: 1,
            used_today: LookupMap::new(StorageKey::UsedToday),
            reputations: LookupMap::new(StorageKey::Reputations),
            disputes: LookupMap::new(StorageKey::Disputes),
            stakes: LookupMap::new(StorageKey::Stakes),
            records: LookupMap::new(StorageKey::Records),
            records_of: LookupMap::new(StorageKey::RecordsOf),
            next_record_id: 1,
        }
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_mandate(&self, account_id: AccountId) -> Mandate {
        self.mandates.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn is_paused(&self, account_id: AccountId) -> bool {
        self.get_mandate(account_id).paused
    }

    #[payable]
    pub fn set_mandate(
        &mut self,
        per_job_cap: U128,
        daily_cap: U128,
        new_seller_cap: U128,
        review_timeout_hours: u32,
        categories: Vec<String>,
        strict: bool,
        approved_sellers: Vec<AccountId>,
    ) {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        require!(!is_agent(&account_id), "Agents cannot change the mandate");
        require!(
            per_job_cap.0 <= daily_cap.0,
            "Per-job cap cannot exceed daily cap"
        );
        require!(
            new_seller_cap.0 <= per_job_cap.0,
            "New-seller cap cannot exceed per-job cap"
        );
        require!(review_timeout_hours > 0, "Review timeout must be positive");
        let paused = self.get_mandate(account_id.clone()).paused;
        let mandate = Mandate {
            per_job_cap,
            daily_cap,
            new_seller_cap,
            review_timeout_hours,
            categories,
            strict,
            approved_sellers,
            paused,
        };
        self.mandates.insert(account_id.clone(), mandate.clone());
        emit(
            "mandate_set",
            json!({
                "account_id": account_id,
                "per_job_cap": mandate.per_job_cap,
                "daily_cap": mandate.daily_cap,
                "new_seller_cap": mandate.new_seller_cap,
                "categories": mandate.categories,
                "strict": mandate.strict,
            }),
        );
    }

    pub fn pause(&mut self) {
        let caller = env::predecessor_account_id();
        let owner = owner_of(&caller);
        let mut mandate = self.get_mandate(owner.clone());
        mandate.paused = true;
        self.mandates.insert(owner.clone(), mandate);
        emit("paused", json!({ "account_id": owner, "by": caller }));
    }

    #[payable]
    pub fn unpause(&mut self) {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        require!(!is_agent(&account_id), "Only the owner can unpause");
        let mut mandate = self.get_mandate(account_id.clone());
        mandate.paused = false;
        self.mandates.insert(account_id.clone(), mandate);
        emit("unpaused", json!({ "account_id": account_id }));
    }

    #[payable]
    pub fn set_fraud_oracle(&mut self, oracle_id: AccountId) {
        assert_one_yocto();
        self.require_config_owner();
        self.config.fraud_oracle = Some(oracle_id);
    }

    #[payable]
    pub fn set_reviewers(&mut self, reviewers: Vec<AccountId>) {
        assert_one_yocto();
        self.require_config_owner();
        require!(reviewers.len() == 3, "Exactly three reviewers");
        self.config.reviewers = reviewers;
    }

    #[payable]
    pub fn register_seller(&mut self, account_id: AccountId) {
        assert_one_yocto();
        self.require_config_owner();
        self.sellers.insert(account_id);
    }

    pub fn is_seller(&self, account_id: AccountId) -> bool {
        self.sellers.contains(&account_id)
    }

    pub fn get_job(&self, job_id: U64) -> Option<Job> {
        self.jobs.get(&job_id.0).cloned()
    }

    pub fn get_bids(&self, job_id: U64) -> Vec<Bid> {
        match self.jobs.get(&job_id.0) {
            Some(job) => job
                .bid_ids
                .iter()
                .filter_map(|id| self.bids.get(&id.0).cloned())
                .collect(),
            None => vec![],
        }
    }

    pub fn post_job(
        &mut self,
        category: String,
        budget_hint: U128,
        spec_hash: String,
        deadline: U64,
    ) -> U64 {
        let buyer = owner_of(&env::predecessor_account_id());
        require!(!category.is_empty(), "Category is required");
        require!(!spec_hash.is_empty(), "Spec hash is required");
        require!(
            deadline.0 > env::block_timestamp(),
            "Deadline must be in the future"
        );
        let job_id = self.next_job_id;
        self.next_job_id += 1;
        let job = Job {
            job_id: U64(job_id),
            buyer: buyer.clone(),
            category: category.clone(),
            budget_hint,
            spec_hash: spec_hash.clone(),
            deadline,
            stage: JobStage::Open,
            bid_ids: vec![],
            accepted_bid: None,
            seller: None,
            price: U128(0),
            holdout_hash: None,
            attempts_left: 0,
            attempt: 0,
            commit_hash: None,
            reviewers: vec![],
            votes: vec![],
            delivered_at: U64(0),
            review_round: 0,
            buyer_rated: false,
            seller_rated: false,
        };
        self.jobs.insert(job_id, job);
        emit(
            "job_posted",
            json!({
                "job_id": U64(job_id),
                "buyer": buyer,
                "category": category,
                "budget_hint": budget_hint,
                "spec_hash": spec_hash,
                "deadline": deadline,
            }),
        );
        U64(job_id)
    }

    pub fn place_bid(&mut self, job_id: U64, price: U128, days: u32) -> U64 {
        let seller = owner_of(&env::predecessor_account_id());
        require!(self.sellers.contains(&seller), "Not a registered seller");
        require!(price.0 > 0, "Price must be positive");
        require!(days > 0, "Days must be positive");
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.stage == JobStage::Open, "Job is not open for bids");
        require!(job.buyer != seller, "Cannot bid on your own job");
        require!(
            job.bid_ids.len() < MAX_BIDS_PER_JOB,
            "Too many bids on this job"
        );
        let already = job.bid_ids.iter().any(|id| {
            self.bids
                .get(&id.0)
                .map(|b| b.seller == seller)
                .unwrap_or(false)
        });
        require!(!already, "Seller already bid on this job");
        let open = self.open_bids.get(&seller).copied().unwrap_or(0);
        require!(
            open < MAX_OPEN_BIDS_PER_SELLER,
            "Too many open bids for this seller"
        );
        let bid_id = self.next_bid_id;
        self.next_bid_id += 1;
        let bid = Bid {
            bid_id: U64(bid_id),
            job_id,
            seller: seller.clone(),
            price,
            days,
            price_check_ok: None,
            fraud_score: 0,
            held: false,
        };
        self.bids.insert(bid_id, bid);
        job.bid_ids.push(U64(bid_id));
        self.jobs.insert(job_id.0, job);
        self.open_bids.insert(seller.clone(), open + 1);
        emit(
            "bid_placed",
            json!({ "job_id": job_id, "bid_id": U64(bid_id), "seller": seller, "price": price, "days": days }),
        );
        U64(bid_id)
    }

    pub fn set_bid_flags(
        &mut self,
        job_id: U64,
        bid_id: U64,
        price_check_ok: bool,
        fraud_score: u8,
        held: bool,
    ) {
        let oracle = self
            .config
            .fraud_oracle
            .clone()
            .unwrap_or_else(|| env::panic_str("No fraud oracle set"));
        require!(
            env::predecessor_account_id() == oracle,
            "Only the fraud oracle can flag bids"
        );
        require!(fraud_score <= 100, "Fraud score is 0 to 100");
        let mut bid = self
            .bids
            .get(&bid_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Bid not found"));
        require!(bid.job_id == job_id, "Bid is not on this job");
        bid.price_check_ok = Some(price_check_ok);
        bid.fraud_score = fraud_score;
        bid.held = held;
        self.bids.insert(bid_id.0, bid);
        emit(
            "bid_flagged",
            json!({
                "job_id": job_id,
                "bid_id": bid_id,
                "price_check_ok": price_check_ok,
                "fraud_score": fraud_score,
                "held": held,
                "high_fraud": fraud_score >= HIGH_FRAUD_SCORE,
            }),
        );
    }

    pub fn get_used_today(&self, account_id: AccountId) -> U128 {
        let today = env::block_timestamp() / NANOS_PER_DAY;
        match self.used_today.get(&account_id) {
            Some((day, used)) if *day == today => U128(*used),
            _ => U128(0),
        }
    }

    pub fn get_reputation(&self, account_id: AccountId) -> Reputation {
        self.reputations
            .get(&account_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn accept_offer(
        &mut self,
        job_id: U64,
        bid_id: U64,
        price: U128,
        spec_hash: String,
        holdout_hash: String,
        attempts: u8,
        deadline: U64,
    ) {
        let caller = owner_of(&env::predecessor_account_id());
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.buyer == caller, "Only the buyer can accept an offer");
        require!(job.stage == JobStage::Open, "Job is not open");
        let bid = self
            .bids
            .get(&bid_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Bid not found"));
        require!(bid.job_id == job_id, "Bid is not on this job");
        require!(
            owner_of(&bid.seller) != job.buyer,
            "Self-dealing: seller is the buyer"
        );
        require!(
            price.0 > 0 && price.0 <= bid.price.0,
            "Price must be positive and not above the bid"
        );
        require!(!spec_hash.is_empty(), "Spec hash is required");
        require!(!holdout_hash.is_empty(), "Holdout hash is required");
        require!(attempts >= 1, "At least one attempt");
        require!(
            deadline.0 > env::block_timestamp(),
            "Deadline must be in the future"
        );
        for id in job.bid_ids.iter() {
            if let Some(b) = self.bids.get(&id.0) {
                let seller = b.seller.clone();
                let open = self.open_bids.get(&seller).copied().unwrap_or(0);
                self.open_bids.insert(seller, open.saturating_sub(1));
            }
        }
        job.stage = JobStage::Accepted;
        job.accepted_bid = Some(bid_id);
        job.seller = Some(bid.seller.clone());
        job.price = price;
        job.spec_hash = spec_hash.clone();
        job.holdout_hash = Some(holdout_hash.clone());
        job.attempts_left = attempts;
        job.deadline = deadline;
        self.jobs.insert(job_id.0, job);
        emit(
            "offer_accepted",
            json!({
                "job_id": job_id,
                "bid_id": bid_id,
                "seller": bid.seller,
                "price": price,
                "spec_hash": spec_hash,
                "holdout_hash": holdout_hash,
                "attempts": attempts,
                "deadline": deadline,
            }),
        );
    }

    pub fn fund_job(&mut self, job_id: U64) {
        let caller = owner_of(&env::predecessor_account_id());
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.buyer == caller, "Only the buyer can fund this job");
        require!(job.stage == JobStage::Accepted, "Job is not accepted");
        let buyer = job.buyer.clone();
        let seller = job.seller.clone().unwrap();
        let bid = self
            .bids
            .get(&job.accepted_bid.unwrap().0)
            .cloned()
            .unwrap();
        let mandate = self.get_mandate(buyer.clone());
        let price = job.price.0;
        let used = self.get_used_today(buyer.clone()).0;
        require!(!mandate.paused, "Paused");
        require!(price <= mandate.per_job_cap.0, "Over per-job cap");
        require!(used + price <= mandate.daily_cap.0, "Over daily cap");
        require!(
            mandate.categories.contains(&job.category),
            "Category not allowed"
        );
        require!(
            !mandate.strict || mandate.approved_sellers.contains(&seller),
            "Seller not approved"
        );
        require!(bid.fraud_score < HIGH_FRAUD_SCORE, "Bid flagged");
        require!(!bid.held, "Bid held by price check");
        let settled = self.get_reputation(seller.clone()).settled;
        let new_seller_cap = if self.get_stake(seller.clone()).0 >= STARTER_STAKE {
            mandate.new_seller_cap.0.max(STAKED_SELLER_CAP)
        } else {
            mandate.new_seller_cap.0
        };
        require!(
            settled >= NEW_SELLER_SETTLED_JOBS || price <= new_seller_cap,
            "Over new-seller cap"
        );
        let mut balance = self.get_balance(buyer.clone());
        require!(balance.free.0 >= price, "Not enough free balance");
        balance.free = U128(balance.free.0 - price);
        balance.escrowed = U128(balance.escrowed.0 + price);
        self.balances.insert(buyer.clone(), balance);
        let today = env::block_timestamp() / NANOS_PER_DAY;
        self.used_today.insert(buyer.clone(), (today, used + price));
        job.stage = JobStage::Funded;
        self.jobs.insert(job_id.0, job);
        emit(
            "job_funded",
            json!({ "job_id": job_id, "buyer": buyer, "amount": U128(price), "used_today": U128(used + price) }),
        );
    }

    pub fn get_votes(&self, job_id: U64) -> Vec<Vote> {
        self.jobs
            .get(&job_id.0)
            .map(|j| j.votes.clone())
            .unwrap_or_default()
    }

    pub fn submit_delivery(&mut self, job_id: U64, commit_hash: String) {
        let caller = owner_of(&env::predecessor_account_id());
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(
            job.seller.as_ref() == Some(&caller),
            "Only the hired seller can deliver"
        );
        require!(
            job.stage == JobStage::Funded,
            "Job is not waiting for a delivery"
        );
        require!(job.attempts_left > 0, "No attempts left");
        require!(
            env::block_timestamp() <= job.deadline.0,
            "Deadline has passed"
        );
        require!(!commit_hash.is_empty(), "Commit hash is required");
        require!(self.config.reviewers.len() == 3, "Reviewers are not set");
        job.attempts_left -= 1;
        job.attempt += 1;
        job.commit_hash = Some(commit_hash.clone());
        job.reviewers = self.config.reviewers.clone();
        job.votes = vec![];
        job.stage = JobStage::Delivered;
        job.delivered_at = U64(env::block_timestamp());
        job.review_round += 1;
        let attempt = job.attempt;
        let reviewers = job.reviewers.clone();
        self.jobs.insert(job_id.0, job);
        emit(
            "delivery_submitted",
            json!({ "job_id": job_id, "attempt": attempt, "commit_hash": commit_hash, "reviewers": reviewers }),
        );
    }

    pub fn vote(&mut self, job_id: U64, approve: bool, log_hash: String, attestation_hash: String) {
        let reviewer = env::predecessor_account_id();
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        let rechecking = job.stage == JobStage::Disputed
            && self
                .disputes
                .get(&job_id.0)
                .is_some_and(|d| d.recheck.is_none() && d.escalated_at.is_none());
        require!(
            job.stage == JobStage::Delivered || rechecking,
            "Job is not under review"
        );
        require!(
            job.reviewers.contains(&reviewer),
            "Not an assigned reviewer"
        );
        require!(
            !job.votes.iter().any(|v| v.reviewer == reviewer),
            "Reviewer already voted"
        );
        job.votes.push(Vote {
            reviewer: reviewer.clone(),
            approve,
            log_hash: log_hash.clone(),
            attestation_hash: attestation_hash.clone(),
        });
        emit(
            "vote_cast",
            json!({
                "job_id": job_id,
                "reviewer": reviewer,
                "approve": approve,
                "log_hash": log_hash,
                "attestation_hash": attestation_hash,
            }),
        );
        let approvals = job.votes.iter().filter(|v| v.approve).count();
        let rejections = job.votes.len() - approvals;
        if rechecking {
            if approvals >= 2 || rejections >= 2 {
                let result = if approvals >= 2 { "release" } else { "refund" };
                let mut dispute = self.disputes.get(&job_id.0).cloned().unwrap();
                dispute.recheck = Some(result.to_string());
                dispute.recheck_at = Some(U64(env::block_timestamp()));
                self.disputes.insert(job_id.0, dispute);
                emit(
                    "recheck_decided",
                    json!({ "job_id": job_id, "result": result }),
                );
            }
        } else if approvals >= 2 {
            self.release(&mut job);
        } else if rejections >= 2 {
            job.stage = JobStage::Funded;
            emit(
                "attempt_failed",
                json!({ "job_id": job_id, "attempt": job.attempt, "attempts_left": job.attempts_left }),
            );
        }
        self.jobs.insert(job_id.0, job);
    }

    pub fn refund_expired(&mut self, job_id: U64) {
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(
            env::block_timestamp() > job.deadline.0,
            "Deadline has not passed"
        );
        require!(
            job.stage == JobStage::Funded || job.stage == JobStage::Delivered,
            "Nothing to refund"
        );
        let price = job.price.0;
        let buyer = job.buyer.clone();
        let mut balance = self.get_balance(buyer.clone());
        balance.escrowed = U128(balance.escrowed.0 - price);
        balance.free = U128(balance.free.0 + price);
        self.balances.insert(buyer.clone(), balance);
        job.stage = JobStage::Refunded;
        self.jobs.insert(job_id.0, job);
        emit(
            "milestone_refunded",
            json!({ "job_id": job_id, "buyer": buyer, "amount": U128(price), "reason": "expired" }),
        );
    }

    pub fn get_balance(&self, account_id: AccountId) -> Balance {
        self.balances.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.config.usdc_token,
            "Only the USDC token can deposit"
        );
        require!(amount.0 > 0, "Amount must be positive");
        if msg == "starter_stake" {
            return self.add_stake(sender_id, amount);
        }
        if let Some(job_id) = msg.strip_prefix("dispute_bond:") {
            let job_id = job_id
                .parse::<u64>()
                .unwrap_or_else(|_| env::panic_str("Bad job id in dispute bond"));
            return self.escalate(sender_id, U64(job_id), amount);
        }
        require!(
            msg == "deposit" || msg.is_empty(),
            "Unsupported deposit message"
        );
        let mut balance = self.get_balance(sender_id.clone());
        balance.free = U128(balance.free.0 + amount.0);
        self.balances.insert(sender_id.clone(), balance.clone());
        emit(
            "deposited",
            json!({ "account_id": sender_id, "amount": amount, "free": balance.free }),
        );
        PromiseOrValue::Value(U128(0))
    }

    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> near_sdk::Promise {
        assert_one_yocto();
        require!(amount.0 > 0, "Amount must be positive");
        let account_id = env::predecessor_account_id();
        let mut balance = self.get_balance(account_id.clone());
        require!(balance.free.0 >= amount.0, "Not enough free balance");
        balance.free = U128(balance.free.0 - amount.0);
        self.balances.insert(account_id.clone(), balance.clone());
        emit(
            "withdrawn",
            json!({ "account_id": account_id, "amount": amount, "free": balance.free }),
        );
        ext_ft::ext(self.config.usdc_token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                account_id.clone(),
                amount,
                Some("AGORA withdraw".to_string()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_WITHDRAW_CALLBACK)
                    .on_withdraw(account_id, amount),
            )
    }

    #[private]
    pub fn on_withdraw(
        &mut self,
        account_id: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        let mut balance = self.get_balance(account_id.clone());
        balance.free = U128(balance.free.0 + amount.0);
        self.balances.insert(account_id.clone(), balance.clone());
        emit(
            "withdraw_failed",
            json!({ "account_id": account_id, "amount": amount, "free": balance.free }),
        );
        false
    }
}

impl Contract {
    fn mint_record(&mut self, owner_id: &AccountId, job_id: U64, amount: u128) {
        let token_id = self.next_record_id.to_string();
        self.next_record_id += 1;
        self.records.insert(
            token_id.clone(),
            Record {
                token_id: token_id.clone(),
                owner_id: owner_id.clone(),
                job_id,
                amount: U128(amount),
                issued_at: U64(env::block_timestamp()),
            },
        );
        let mut owned = self.records_of.get(owner_id).cloned().unwrap_or_default();
        owned.push(token_id.clone());
        self.records_of.insert(owner_id.clone(), owned);
        let line = json!({
            "standard": "nep171",
            "version": "1.0.0",
            "event": "nft_mint",
            "data": [{ "owner_id": owner_id, "token_ids": [token_id], "memo": format!("Completion record for job {}", job_id.0) }],
        });
        env::log_str(&format!("EVENT_JSON:{}", line));
    }

    fn refund_to_buyer(&mut self, job: &mut Job, reason: &str) {
        let price = job.price.0;
        let mut balance = self.get_balance(job.buyer.clone());
        balance.escrowed = U128(balance.escrowed.0 - price);
        balance.free = U128(balance.free.0 + price);
        self.balances.insert(job.buyer.clone(), balance);
        job.stage = JobStage::Refunded;
        emit(
            "milestone_refunded",
            json!({ "job_id": job.job_id, "buyer": job.buyer, "amount": U128(price), "reason": reason }),
        );
    }

    fn split(&mut self, job: &mut Job, seller_share_bps: u16) {
        let price = job.price.0;
        let gross = price * seller_share_bps as u128 / 10_000;
        let fee = gross * self.config.fee_bps as u128 / 10_000;
        let seller = job.seller.clone().unwrap();
        let mut buyer_balance = self.get_balance(job.buyer.clone());
        buyer_balance.escrowed = U128(buyer_balance.escrowed.0 - price);
        buyer_balance.free = U128(buyer_balance.free.0 + price - gross);
        self.balances.insert(job.buyer.clone(), buyer_balance);
        self.credit(&seller, gross - fee);
        let dao = self.config.dao_account.clone();
        self.credit(&dao, fee);
        job.stage = JobStage::Released;
        let mut rep = self.get_reputation(seller.clone());
        rep.settled += 1;
        self.reputations.insert(seller.clone(), rep);
        self.mint_record(&seller, job.job_id, gross - fee);
        emit(
            "milestone_split",
            json!({
                "job_id": job.job_id,
                "seller": seller,
                "seller_amount": U128(gross - fee),
                "buyer_amount": U128(price - gross),
                "fee": U128(fee),
            }),
        );
    }

    fn settle_dispute(&mut self, job_id: U64, outcome: &str, seller_share_bps: u16, by: &str) {
        let mut job = self.jobs.get(&job_id.0).cloned().unwrap();
        let mut dispute = self.disputes.get(&job_id.0).cloned().unwrap();
        let price = job.price.0;
        let gross = price * seller_share_bps as u128 / 10_000;
        let seller_amount = gross - gross * self.config.fee_bps as u128 / 10_000;
        let buyer_amount = price - gross;
        match outcome {
            "release" => self.release(&mut job),
            "refund" => self.refund_to_buyer(&mut job, "dispute"),
            _ => self.split(&mut job, seller_share_bps),
        }
        let claim_held = dispute.claim.as_deref() == Some(outcome) || outcome == "split";
        let bond = dispute.bond.0;
        if bond > 0 {
            let to = if claim_held && by == "dao" {
                dispute.escalated_by.clone().unwrap()
            } else {
                self.config.dao_account.clone()
            };
            self.credit(&to, bond);
        }
        dispute.outcome = Some(outcome.to_string());
        self.disputes.insert(job_id.0, dispute);
        self.jobs.insert(job_id.0, job);
        emit(
            "dispute_resolved",
            json!({
                "job_id": job_id,
                "outcome": outcome,
                "seller_amount": U128(seller_amount),
                "buyer_amount": U128(buyer_amount),
                "seller_share_bps": seller_share_bps,
                "by": by,
                "bond_returned": bond > 0 && claim_held && by == "dao",
            }),
        );
    }

    fn reassign_reviewers(&self, job: &mut Job) {
        job.reviewers = self.config.reviewers.clone();
        job.votes = vec![];
        job.delivered_at = U64(env::block_timestamp());
        job.review_round += 1;
    }

    fn add_stake(&mut self, sender_id: AccountId, amount: U128) -> PromiseOrValue<U128> {
        require!(
            self.sellers.contains(&sender_id),
            "Only a registered seller can stake"
        );
        let total = self.get_stake(sender_id.clone()).0 + amount.0;
        self.stakes.insert(sender_id.clone(), total);
        emit(
            "stake_added",
            json!({ "account_id": sender_id, "amount": amount, "stake": U128(total) }),
        );
        PromiseOrValue::Value(U128(0))
    }

    fn escalate(
        &mut self,
        sender_id: AccountId,
        job_id: U64,
        amount: U128,
    ) -> PromiseOrValue<U128> {
        let job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.stage == JobStage::Disputed, "Job is not disputed");
        let party = owner_of(&sender_id);
        let claim = if party == job.buyer {
            "refund"
        } else if job.seller.as_ref() == Some(&party) {
            "release"
        } else {
            env::panic_str("Only the buyer or seller can escalate")
        };
        let mut dispute = self.disputes.get(&job_id.0).cloned().unwrap();
        require!(
            dispute.escalated_at.is_none(),
            "Dispute is already escalated"
        );
        let recheck = dispute
            .recheck
            .clone()
            .unwrap_or_else(|| env::panic_str("Wait for the re-check result"));
        require!(
            env::block_timestamp() < dispute.recheck_at.unwrap().0 + ESCALATION_WINDOW,
            "The escalation window has closed"
        );
        require!(recheck != claim, "The re-check already agrees with you");
        let needed = (job.price.0 * BOND_BPS / 10_000).max(MIN_BOND);
        require!(
            amount.0 >= needed,
            "Bond is below 5% of the price (minimum 1 USDC)"
        );
        dispute.escalated_by = Some(sender_id.clone());
        dispute.escalated_at = Some(U64(env::block_timestamp()));
        dispute.claim = Some(claim.to_string());
        dispute.bond = amount;
        self.disputes.insert(job_id.0, dispute);
        emit(
            "dispute_escalated",
            json!({ "job_id": job_id, "by": sender_id, "claim": claim, "bond": amount }),
        );
        let args = json!({
            "job_id": job_id,
            "outcome": claim,
            "seller_share_bps": if claim == "release" { 10_000 } else { 0 },
        });
        let proposal = json!({
            "proposal": {
                "description": format!("AGORA dispute on job {}: {} asks for {}", job_id.0, sender_id, claim),
                "kind": {
                    "FunctionCall": {
                        "receiver_id": env::current_account_id(),
                        "actions": [{
                            "method_name": "resolve_dispute",
                            "args": Base64VecU8::from(args.to_string().into_bytes()),
                            "deposit": "0",
                            "gas": U64(GAS_FOR_RESOLVE),
                        }],
                    }
                }
            }
        });
        let _ = Promise::new(self.config.dao_account.clone())
            .function_call(
                "add_proposal".to_string(),
                proposal.to_string().into_bytes(),
                NearToken::from_yoctonear(self.config.proposal_bond.0),
                GAS_FOR_ADD_PROPOSAL,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_PROPOSAL_CALLBACK)
                    .on_proposal_added(job_id),
            );
        PromiseOrValue::Value(U128(0))
    }
}

#[near]
impl Contract {
    #[payable]
    pub fn set_proposal_bond(&mut self, proposal_bond: U128) {
        assert_one_yocto();
        self.require_config_owner();
        self.config.proposal_bond = proposal_bond;
    }

    pub fn rerun_review(&mut self, job_id: U64) {
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        let rechecking = job.stage == JobStage::Disputed
            && self
                .disputes
                .get(&job_id.0)
                .is_some_and(|d| d.recheck.is_none() && d.escalated_at.is_none());
        require!(
            job.stage == JobStage::Delivered || rechecking,
            "Job is not under review"
        );
        let approvals = job.votes.iter().filter(|v| v.approve).count();
        let rejections = job.votes.len() - approvals;
        let split = approvals == 1 && rejections == 1;
        let timeout =
            self.get_mandate(job.buyer.clone()).review_timeout_hours as u64 * NANOS_PER_HOUR;
        let stalled = env::block_timestamp() >= job.delivered_at.0 + timeout;
        require!(
            split || stalled,
            "A rerun needs a split vote or the review timeout"
        );
        self.reassign_reviewers(&mut job);
        let round = job.review_round;
        self.jobs.insert(job_id.0, job);
        emit(
            "review_rerun",
            json!({ "job_id": job_id, "round": round, "reason": if split { "split" } else { "timeout" } }),
        );
    }

    pub fn refund_milestone(&mut self, job_id: U64) {
        let caller = owner_of(&env::predecessor_account_id());
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.buyer == caller, "Only the buyer can refund");
        require!(
            job.stage == JobStage::Funded && job.attempt > 0 && job.attempts_left == 0,
            "Refund is allowed after the last attempt fails"
        );
        self.refund_to_buyer(&mut job, "failed");
        self.jobs.insert(job_id.0, job);
    }

    pub fn grant_attempt(&mut self, job_id: U64) {
        let caller = owner_of(&env::predecessor_account_id());
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.buyer == caller, "Only the buyer can grant an attempt");
        require!(
            job.stage == JobStage::Funded && job.attempt > 0 && job.attempts_left == 0,
            "An extra attempt is allowed after the last attempt fails"
        );
        job.attempts_left = 1;
        self.jobs.insert(job_id.0, job);
        emit(
            "attempt_granted",
            json!({ "job_id": job_id, "attempts_left": 1 }),
        );
    }

    pub fn open_dispute(&mut self, job_id: U64, reason: String) {
        let caller = owner_of(&env::predecessor_account_id());
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(
            job.buyer == caller || job.seller.as_ref() == Some(&caller),
            "Only the buyer or seller can open a dispute"
        );
        require!(
            job.stage == JobStage::Delivered || (job.stage == JobStage::Funded && job.attempt > 0),
            "Only a delivered job can be disputed"
        );
        require!(!reason.trim().is_empty(), "Reason is required");
        require!(reason.len() <= MAX_REASON_LEN, "Reason is too long");
        require!(
            self.disputes.get(&job_id.0).is_none(),
            "This job was already disputed"
        );
        require!(self.config.reviewers.len() == 3, "Reviewers are not set");
        self.disputes.insert(
            job_id.0,
            Dispute {
                job_id,
                opened_by: caller.clone(),
                reason: reason.clone(),
                opened_at: U64(env::block_timestamp()),
                recheck: None,
                recheck_at: None,
                escalated_by: None,
                escalated_at: None,
                claim: None,
                bond: U128(0),
                proposal_id: None,
                outcome: None,
            },
        );
        job.stage = JobStage::Disputed;
        self.reassign_reviewers(&mut job);
        let seller = job.seller.clone().unwrap();
        self.jobs.insert(job_id.0, job);
        let mut rep = self.get_reputation(seller.clone());
        rep.disputes += 1;
        self.reputations.insert(seller, rep);
        emit(
            "dispute_opened",
            json!({ "job_id": job_id, "opener": caller, "reason": reason }),
        );
    }

    pub fn resolve_dispute(&mut self, job_id: U64, outcome: String, seller_share_bps: u16) {
        require!(
            env::predecessor_account_id() == self.config.dao_account,
            "Only the DAO can resolve a dispute"
        );
        let job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.stage == JobStage::Disputed, "Job is not disputed");
        let dispute = self.disputes.get(&job_id.0).cloned().unwrap();
        require!(
            dispute.escalated_at.is_some(),
            "The dispute was not escalated"
        );
        let bps = match outcome.as_str() {
            "release" => 10_000,
            "refund" => 0,
            "split" => {
                require!(
                    seller_share_bps > 0 && seller_share_bps < 10_000,
                    "A split needs a share between 1 and 9999"
                );
                seller_share_bps
            }
            _ => env::panic_str("Outcome must be release, refund or split"),
        };
        self.settle_dispute(job_id, outcome.as_str(), bps, "dao");
    }

    pub fn finalize_default(&mut self, job_id: U64) {
        let job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.stage == JobStage::Disputed, "Job is not disputed");
        let dispute = self.disputes.get(&job_id.0).cloned().unwrap();
        let recheck = dispute
            .recheck
            .clone()
            .unwrap_or_else(|| env::panic_str("The re-check has no result yet"));
        let since = dispute.escalated_at.or(dispute.recheck_at).unwrap().0;
        require!(
            env::block_timestamp() >= since + ESCALATION_WINDOW,
            "Wait 72 hours before finalizing"
        );
        let bps = if recheck == "release" { 10_000 } else { 0 };
        self.settle_dispute(job_id, recheck.as_str(), bps, "default");
    }

    #[private]
    pub fn on_proposal_added(
        &mut self,
        job_id: U64,
        #[callback_result] result: Result<U64, PromiseError>,
    ) {
        match result {
            Ok(id) => {
                if let Some(mut dispute) = self.disputes.get(&job_id.0).cloned() {
                    dispute.proposal_id = Some(id);
                    self.disputes.insert(job_id.0, dispute);
                }
                emit(
                    "proposal_added",
                    json!({ "job_id": job_id, "proposal_id": id }),
                );
            }
            Err(_) => emit("proposal_failed", json!({ "job_id": job_id })),
        }
    }

    pub fn rate(&mut self, job_id: U64, stars: u8) {
        let caller = owner_of(&env::predecessor_account_id());
        let mut job = self
            .jobs
            .get(&job_id.0)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(
            job.stage == JobStage::Released,
            "Only a paid job can be rated"
        );
        require!((1..=5).contains(&stars), "Stars must be between 1 and 5");
        let seller = job.seller.clone().unwrap();
        let ratee = if caller == job.buyer {
            require!(!job.buyer_rated, "You already rated this job");
            job.buyer_rated = true;
            seller
        } else if caller == seller {
            require!(!job.seller_rated, "You already rated this job");
            job.seller_rated = true;
            job.buyer.clone()
        } else {
            env::panic_str("Only the buyer or seller can rate")
        };
        self.jobs.insert(job_id.0, job);
        let mut rep = self.get_reputation(ratee.clone());
        rep.rating_sum += stars as u32;
        rep.rating_count += 1;
        self.reputations.insert(ratee.clone(), rep.clone());
        emit(
            "rated",
            json!({ "job_id": job_id, "by": caller, "account_id": ratee, "stars": stars }),
        );
        let rating_avg = rep.rating_sum as f64 / rep.rating_count as f64;
        emit(
            "reputation_updated",
            json!({ "account_id": ratee, "settled": rep.settled, "disputes": rep.disputes, "rating_avg": rating_avg }),
        );
    }

    pub fn return_stake(&mut self) {
        let caller = env::predecessor_account_id();
        let stake = self.get_stake(caller.clone()).0;
        require!(stake > 0, "Nothing staked");
        let rep = self.get_reputation(caller.clone());
        require!(
            rep.settled >= NEW_SELLER_SETTLED_JOBS && rep.disputes == 0,
            "The stake comes back after 3 settled jobs with no disputes"
        );
        self.stakes.remove(&caller);
        self.credit(&caller, stake);
        emit(
            "stake_returned",
            json!({ "account_id": caller, "amount": U128(stake) }),
        );
    }

    pub fn get_dispute(&self, job_id: U64) -> Option<Dispute> {
        self.disputes.get(&job_id.0).cloned()
    }

    pub fn get_stake(&self, account_id: AccountId) -> U128 {
        U128(self.stakes.get(&account_id).copied().unwrap_or(0))
    }

    pub fn nft_metadata(&self) -> ContractMetadata {
        ContractMetadata {
            spec: "nft-1.0.0".to_string(),
            name: "AGORA completion record".to_string(),
            symbol: "AGORA-DONE".to_string(),
        }
    }

    pub fn nft_token(&self, token_id: String) -> Option<Token> {
        self.records.get(&token_id).map(|r| Token {
            token_id: r.token_id.clone(),
            owner_id: r.owner_id.clone(),
            metadata: TokenMetadata {
                title: format!("Completed job {}", r.job_id.0),
                description: "Non-transferable record of a settled AGORA job".to_string(),
                issued_at: r.issued_at.0.to_string(),
                extra: json!({ "job_id": r.job_id, "amount": r.amount }).to_string(),
            },
        })
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128((self.next_record_id - 1) as u128)
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(
            self.records_of
                .get(&account_id)
                .map(|v| v.len())
                .unwrap_or(0) as u128,
        )
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        let ids = self
            .records_of
            .get(&account_id)
            .cloned()
            .unwrap_or_default();
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let take = limit.unwrap_or(50).min(100) as usize;
        ids.iter()
            .skip(start)
            .take(take)
            .filter_map(|id| self.nft_token(id.clone()))
            .collect()
    }

    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let _ = (receiver_id, token_id, approval_id, memo);
        env::panic_str("Completion records are non-transferable")
    }

    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let _ = (receiver_id, token_id, approval_id, memo, msg);
        env::panic_str("Completion records are non-transferable")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn acc(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn setup() -> Contract {
        Contract::new(
            acc("owner.testnet"),
            acc("usdc.testnet"),
            acc("dao.testnet"),
        )
    }

    fn call_from(predecessor: &str, deposit: u128) {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(acc("agora-market.testnet"))
            .predecessor_account_id(acc(predecessor))
            .signer_account_id(acc(predecessor))
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(ctx.build());
    }

    fn deposit(contract: &mut Contract, who: &str, amount: u128) {
        call_from("usdc.testnet", 0);
        let _ = contract.ft_on_transfer(acc(who), U128(amount), "deposit".to_string());
    }

    fn admin_setup() -> Contract {
        let mut contract = setup();
        call_from("owner.testnet", 1);
        contract.set_fraud_oracle(acc("oracle.testnet"));
        contract.register_seller(acc("seller.testnet"));
        contract
    }

    fn post(contract: &mut Contract, from: &str) -> U64 {
        call_from(from, 0);
        contract.post_job(
            "rust".to_string(),
            U128(40_000_000),
            "spec-hash-1".to_string(),
            U64(10_000),
        )
    }

    fn call_at(predecessor: &str, deposit: u128, timestamp: u64) {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(acc("agora-market.testnet"))
            .predecessor_account_id(acc(predecessor))
            .signer_account_id(acc(predecessor))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(timestamp);
        testing_env!(ctx.build());
    }

    const DAY: u64 = 86_400_000_000_000;
    const FAR: u64 = 30 * 86_400_000_000_000;

    fn hired_job(contract: &mut Contract, price: u128, seller: &str, at: u64) -> U64 {
        call_at("agents.alice.testnet", 0, at);
        let job_id = contract.post_job(
            "rust".to_string(),
            U128(price),
            "spec".to_string(),
            U64(FAR),
        );
        call_at(seller, 0, at);
        let bid_id = contract.place_bid(job_id, U128(price), 2);
        call_at("agents.alice.testnet", 0, at);
        contract.accept_offer(
            job_id,
            bid_id,
            U128(price),
            "spec".to_string(),
            "holdout".to_string(),
            2,
            U64(FAR),
        );
        job_id
    }

    fn funded_setup() -> Contract {
        let mut contract = admin_setup();
        call_from("owner.testnet", 1);
        contract.register_seller(acc("veteran.testnet"));
        contract.reputations.insert(
            acc("veteran.testnet"),
            Reputation {
                settled: 5,
                disputes: 0,
                rating_sum: 25,
                rating_count: 5,
            },
        );
        deposit(&mut contract, "alice.testnet", 200_000_000);
        contract
    }

    fn delivered_job(contract: &mut Contract) -> U64 {
        call_from("owner.testnet", 1);
        contract.set_reviewers(vec![
            acc("r1.testnet"),
            acc("r2.testnet"),
            acc("r3.testnet"),
        ]);
        let job_id = hired_job(contract, 32_000_000, "veteran.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
        call_at("agents.veteran.testnet", 0, 0);
        contract.submit_delivery(job_id, "commit-1".to_string());
        job_id
    }

    fn vote_as(contract: &mut Contract, job_id: U64, reviewer: &str, approve: bool) {
        call_at(reviewer, 0, 0);
        contract.vote(job_id, approve, "log".to_string(), "att".to_string());
    }

    #[test]
    fn two_approvals_release_with_fee() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        vote_as(&mut contract, job_id, "r1.testnet", true);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Delivered);
        vote_as(&mut contract, job_id, "r2.testnet", true);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Released);
        assert_eq!(
            contract.get_balance(acc("veteran.testnet")).free.0,
            31_360_000
        );
        assert_eq!(contract.get_balance(acc("dao.testnet")).free.0, 640_000);
        let buyer = contract.get_balance(acc("alice.testnet"));
        assert_eq!(buyer.escrowed.0, 0);
        assert_eq!(buyer.free.0, 168_000_000);
        assert_eq!(contract.get_reputation(acc("veteran.testnet")).settled, 6);
    }

    #[test]
    fn two_rejections_fail_the_attempt_and_allow_resubmit() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        vote_as(&mut contract, job_id, "r1.testnet", false);
        vote_as(&mut contract, job_id, "r2.testnet", false);
        let job = contract.get_job(job_id).unwrap();
        assert_eq!(job.stage, JobStage::Funded);
        assert_eq!(job.attempts_left, 1);
        call_at("veteran.testnet", 0, 0);
        contract.submit_delivery(job_id, "commit-2".to_string());
        vote_as(&mut contract, job_id, "r1.testnet", true);
        vote_as(&mut contract, job_id, "r3.testnet", true);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Released);
    }

    #[test]
    #[should_panic(expected = "No attempts left")]
    fn attempts_run_out() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        for _ in 0..2 {
            vote_as(&mut contract, job_id, "r1.testnet", false);
            vote_as(&mut contract, job_id, "r2.testnet", false);
            call_at("veteran.testnet", 0, 0);
            contract.submit_delivery(job_id, "again".to_string());
        }
    }

    #[test]
    #[should_panic(expected = "Not an assigned reviewer")]
    fn unassigned_vote_fails() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        vote_as(&mut contract, job_id, "mallory.testnet", true);
    }

    #[test]
    #[should_panic(expected = "Reviewer already voted")]
    fn reviewer_cannot_vote_twice() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        vote_as(&mut contract, job_id, "r1.testnet", true);
        vote_as(&mut contract, job_id, "r1.testnet", true);
    }

    #[test]
    #[should_panic(expected = "Only the hired seller can deliver")]
    fn other_seller_cannot_deliver() {
        let mut contract = funded_setup();
        call_from("owner.testnet", 1);
        contract.set_reviewers(vec![
            acc("r1.testnet"),
            acc("r2.testnet"),
            acc("r3.testnet"),
        ]);
        let job_id = hired_job(&mut contract, 32_000_000, "veteran.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
        call_at("seller.testnet", 0, 0);
        contract.submit_delivery(job_id, "commit".to_string());
    }

    #[test]
    fn refund_after_deadline() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("anyone.testnet", 0, FAR + 1);
        contract.refund_expired(job_id);
        let buyer = contract.get_balance(acc("alice.testnet"));
        assert_eq!(buyer.free.0, 200_000_000);
        assert_eq!(buyer.escrowed.0, 0);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Refunded);
    }

    #[test]
    #[should_panic(expected = "Deadline has not passed")]
    fn refund_before_deadline_fails() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("anyone.testnet", 0, 5);
        contract.refund_expired(job_id);
    }

    #[test]
    #[should_panic(expected = "Nothing to refund")]
    fn released_job_cannot_be_refunded() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        vote_as(&mut contract, job_id, "r1.testnet", true);
        vote_as(&mut contract, job_id, "r2.testnet", true);
        call_at("anyone.testnet", 0, FAR + 1);
        contract.refund_expired(job_id);
    }

    #[test]
    fn fund_job_moves_free_to_escrow() {
        let mut contract = funded_setup();
        let job_id = hired_job(&mut contract, 32_000_000, "veteran.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
        let balance = contract.get_balance(acc("alice.testnet"));
        assert_eq!(balance.free.0, 168_000_000);
        assert_eq!(balance.escrowed.0, 32_000_000);
        assert_eq!(contract.get_used_today(acc("alice.testnet")).0, 32_000_000);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Funded);
    }

    #[test]
    #[should_panic(expected = "Paused")]
    fn check_1_paused() {
        let mut contract = funded_setup();
        let job_id = hired_job(&mut contract, 32_000_000, "veteran.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.pause();
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Over per-job cap")]
    fn check_2_over_per_job_cap() {
        let mut contract = funded_setup();
        let job_id = hired_job(&mut contract, 400_000_000, "veteran.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Over daily cap")]
    fn check_3_over_daily_cap() {
        let mut contract = funded_setup();
        for _ in 0..3 {
            let job_id = hired_job(&mut contract, 49_000_000, "veteran.testnet", 0);
            call_at("agents.alice.testnet", 0, 0);
            contract.fund_job(job_id);
        }
    }

    #[test]
    fn daily_cap_resets_at_utc_midnight() {
        let mut contract = funded_setup();
        let fund_at = |contract: &mut Contract, at: u64| {
            let job_id = hired_job(contract, 49_000_000, "veteran.testnet", at);
            call_at("agents.alice.testnet", 0, at);
            contract.fund_job(job_id);
        };
        fund_at(&mut contract, DAY - 2);
        fund_at(&mut contract, DAY - 1);
        fund_at(&mut contract, DAY);
        assert_eq!(contract.get_used_today(acc("alice.testnet")).0, 49_000_000);
    }

    #[test]
    #[should_panic(expected = "Category not allowed")]
    fn check_4_wrong_category() {
        let mut contract = funded_setup();
        call_at("agents.alice.testnet", 0, 0);
        let job_id =
            contract.post_job("scripts".to_string(), U128(1), "spec".to_string(), U64(FAR));
        call_at("veteran.testnet", 0, 0);
        let bid_id = contract.place_bid(job_id, U128(10_000_000), 2);
        call_at("agents.alice.testnet", 0, 0);
        contract.accept_offer(
            job_id,
            bid_id,
            U128(10_000_000),
            "spec".to_string(),
            "h".to_string(),
            2,
            U64(FAR),
        );
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Seller not approved")]
    fn check_5_strict_mode() {
        let mut contract = funded_setup();
        call_from("alice.testnet", 1);
        contract.set_mandate(
            U128(50_000_000),
            U128(120_000_000),
            U128(25_000_000),
            12,
            vec!["rust".to_string()],
            true,
            vec![acc("someone-else.testnet")],
        );
        let job_id = hired_job(&mut contract, 32_000_000, "veteran.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Bid flagged")]
    fn check_6_high_fraud_flag() {
        let mut contract = funded_setup();
        let job_id = hired_job(&mut contract, 32_000_000, "veteran.testnet", 0);
        let bid_id = contract.get_job(job_id).unwrap().accepted_bid.unwrap();
        call_at("oracle.testnet", 0, 0);
        contract.set_bid_flags(job_id, bid_id, true, 90, false);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Bid held by price check")]
    fn check_7_held_bid() {
        let mut contract = funded_setup();
        let job_id = hired_job(&mut contract, 32_000_000, "veteran.testnet", 0);
        let bid_id = contract.get_job(job_id).unwrap().accepted_bid.unwrap();
        call_at("oracle.testnet", 0, 0);
        contract.set_bid_flags(job_id, bid_id, false, 10, true);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Over new-seller cap")]
    fn check_8_new_seller_cap() {
        let mut contract = funded_setup();
        let job_id = hired_job(&mut contract, 32_000_000, "seller.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Not enough free balance")]
    fn check_9_not_enough_balance() {
        let mut contract = admin_setup();
        call_from("owner.testnet", 1);
        contract.register_seller(acc("veteran.testnet"));
        contract.reputations.insert(
            acc("veteran.testnet"),
            Reputation {
                settled: 5,
                ..Default::default()
            },
        );
        deposit(&mut contract, "alice.testnet", 10_000_000);
        let job_id = hired_job(&mut contract, 32_000_000, "veteran.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can accept an offer")]
    fn stranger_cannot_accept() {
        let mut contract = funded_setup();
        call_at("agents.alice.testnet", 0, 0);
        let job_id = contract.post_job("rust".to_string(), U128(1), "spec".to_string(), U64(FAR));
        call_at("veteran.testnet", 0, 0);
        let bid_id = contract.place_bid(job_id, U128(10_000_000), 2);
        call_at("agents.mallory.testnet", 0, 0);
        contract.accept_offer(
            job_id,
            bid_id,
            U128(10_000_000),
            "spec".to_string(),
            "h".to_string(),
            2,
            U64(FAR),
        );
    }

    #[test]
    fn accept_frees_open_bid_slots() {
        let mut contract = funded_setup();
        hired_job(&mut contract, 10_000_000, "veteran.testnet", 0);
        assert_eq!(*contract.open_bids.get(&acc("veteran.testnet")).unwrap(), 0);
    }

    #[test]
    fn agent_posts_job_for_owner() {
        let mut contract = admin_setup();
        let job_id = post(&mut contract, "agents.alice.testnet");
        let job = contract.get_job(job_id).unwrap();
        assert_eq!(job.buyer, acc("alice.testnet"));
        assert_eq!(job.stage, JobStage::Open);
        assert_eq!(job_id.0, 1);
    }

    #[test]
    fn registered_seller_bids() {
        let mut contract = admin_setup();
        let job_id = post(&mut contract, "alice.testnet");
        call_from("agents.seller.testnet", 0);
        let bid_id = contract.place_bid(job_id, U128(32_000_000), 2);
        let bids = contract.get_bids(job_id);
        assert_eq!(bids.len(), 1);
        assert_eq!(bids[0].bid_id, bid_id);
        assert_eq!(bids[0].seller, acc("seller.testnet"));
    }

    #[test]
    #[should_panic(expected = "Not a registered seller")]
    fn unregistered_seller_cannot_bid() {
        let mut contract = admin_setup();
        let job_id = post(&mut contract, "alice.testnet");
        call_from("spammer.testnet", 0);
        contract.place_bid(job_id, U128(1_000_000), 1);
    }

    #[test]
    #[should_panic(expected = "Seller already bid on this job")]
    fn seller_cannot_bid_twice() {
        let mut contract = admin_setup();
        let job_id = post(&mut contract, "alice.testnet");
        call_from("seller.testnet", 0);
        contract.place_bid(job_id, U128(32_000_000), 2);
        contract.place_bid(job_id, U128(30_000_000), 2);
    }

    #[test]
    #[should_panic(expected = "Too many open bids for this seller")]
    fn seller_open_bid_cap() {
        let mut contract = admin_setup();
        for _ in 0..11 {
            let job_id = post(&mut contract, "alice.testnet");
            call_from("seller.testnet", 0);
            contract.place_bid(job_id, U128(1_000_000), 1);
        }
    }

    #[test]
    #[should_panic(expected = "Cannot bid on your own job")]
    fn seller_cannot_bid_on_own_job() {
        let mut contract = admin_setup();
        let job_id = post(&mut contract, "seller.testnet");
        call_from("seller.testnet", 0);
        contract.place_bid(job_id, U128(1_000_000), 1);
    }

    #[test]
    fn oracle_flags_bid() {
        let mut contract = admin_setup();
        let job_id = post(&mut contract, "alice.testnet");
        call_from("seller.testnet", 0);
        let bid_id = contract.place_bid(job_id, U128(32_000_000), 2);
        call_from("oracle.testnet", 0);
        contract.set_bid_flags(job_id, bid_id, false, 85, true);
        let bid = &contract.get_bids(job_id)[0];
        assert_eq!(bid.price_check_ok, Some(false));
        assert_eq!(bid.fraud_score, 85);
        assert!(bid.held);
    }

    #[test]
    #[should_panic(expected = "Only the fraud oracle can flag bids")]
    fn others_cannot_flag_bid() {
        let mut contract = admin_setup();
        let job_id = post(&mut contract, "alice.testnet");
        call_from("seller.testnet", 0);
        let bid_id = contract.place_bid(job_id, U128(32_000_000), 2);
        call_from("alice.testnet", 0);
        contract.set_bid_flags(job_id, bid_id, true, 0, false);
    }

    #[test]
    fn init_sets_config() {
        let contract = setup();
        let config = contract.get_config();
        assert_eq!(config.owner_id, acc("owner.testnet"));
        assert_eq!(config.usdc_token, acc("usdc.testnet"));
        assert_eq!(config.dao_account, acc("dao.testnet"));
        assert_eq!(config.fee_bps, 200);
        assert!(!contract.is_paused(acc("alice.testnet")));
    }

    #[test]
    fn mandate_defaults_match_limits_page() {
        let contract = setup();
        let mandate = contract.get_mandate(acc("alice.testnet"));
        assert_eq!(mandate.per_job_cap.0, 50_000_000);
        assert_eq!(mandate.daily_cap.0, 120_000_000);
        assert_eq!(mandate.new_seller_cap.0, 25_000_000);
        assert!(!mandate.strict);
    }

    fn set_caps(contract: &mut Contract, per_job: u128, daily: u128) {
        contract.set_mandate(
            U128(per_job),
            U128(daily),
            U128(per_job),
            12,
            vec!["rust".to_string()],
            true,
            vec![acc("seller.testnet")],
        );
    }

    #[test]
    fn owner_sets_mandate() {
        let mut contract = setup();
        call_from("alice.testnet", 1);
        set_caps(&mut contract, 30_000_000, 90_000_000);
        let mandate = contract.get_mandate(acc("alice.testnet"));
        assert_eq!(mandate.per_job_cap.0, 30_000_000);
        assert!(mandate.strict);
        assert_eq!(mandate.approved_sellers, vec![acc("seller.testnet")]);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn agent_key_cannot_set_mandate() {
        let mut contract = setup();
        call_from("agents.alice.testnet", 0);
        set_caps(&mut contract, 30_000_000, 90_000_000);
    }

    #[test]
    #[should_panic(expected = "Agents cannot change the mandate")]
    fn agent_account_cannot_set_mandate() {
        let mut contract = setup();
        call_from("agents.alice.testnet", 1);
        set_caps(&mut contract, 30_000_000, 90_000_000);
    }

    #[test]
    #[should_panic(expected = "Per-job cap cannot exceed daily cap")]
    fn per_job_cap_over_daily_cap_fails() {
        let mut contract = setup();
        call_from("alice.testnet", 1);
        set_caps(&mut contract, 100_000_000, 90_000_000);
    }

    #[test]
    fn guardian_pauses_owner() {
        let mut contract = setup();
        call_from("agents.alice.testnet", 0);
        contract.pause();
        assert!(contract.is_paused(acc("alice.testnet")));
        assert!(!contract.is_paused(acc("bob.testnet")));
    }

    #[test]
    #[should_panic(expected = "Only the owner can unpause")]
    fn agent_cannot_unpause() {
        let mut contract = setup();
        call_from("agents.alice.testnet", 0);
        contract.pause();
        call_from("agents.alice.testnet", 1);
        contract.unpause();
    }

    #[test]
    fn owner_unpauses_and_mandate_keeps_pause_state() {
        let mut contract = setup();
        call_from("alice.testnet", 0);
        contract.pause();
        call_from("alice.testnet", 1);
        set_caps(&mut contract, 30_000_000, 90_000_000);
        assert!(contract.is_paused(acc("alice.testnet")));
        contract.unpause();
        assert!(!contract.is_paused(acc("alice.testnet")));
    }

    #[test]
    fn deposit_credits_free_balance() {
        let mut contract = setup();
        deposit(&mut contract, "alice.testnet", 50_000_000);
        deposit(&mut contract, "alice.testnet", 10_000_000);
        let balance = contract.get_balance(acc("alice.testnet"));
        assert_eq!(balance.free.0, 60_000_000);
        assert_eq!(balance.escrowed.0, 0);
    }

    #[test]
    #[should_panic(expected = "Only the USDC token can deposit")]
    fn deposit_from_other_token_fails() {
        let mut contract = setup();
        call_from("fake-token.testnet", 0);
        let _ = contract.ft_on_transfer(acc("alice.testnet"), U128(1), "deposit".to_string());
    }

    #[test]
    fn withdraw_reduces_free_balance() {
        let mut contract = setup();
        deposit(&mut contract, "alice.testnet", 50_000_000);
        call_from("alice.testnet", 1);
        let _ = contract.withdraw(U128(20_000_000));
        assert_eq!(
            contract.get_balance(acc("alice.testnet")).free.0,
            30_000_000
        );
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn agent_key_cannot_withdraw() {
        let mut contract = setup();
        deposit(&mut contract, "alice.testnet", 50_000_000);
        call_from("alice.testnet", 0);
        let _ = contract.withdraw(U128(1));
    }

    #[test]
    #[should_panic(expected = "Not enough free balance")]
    fn withdraw_over_balance_fails() {
        let mut contract = setup();
        deposit(&mut contract, "alice.testnet", 5_000_000);
        call_from("alice.testnet", 1);
        let _ = contract.withdraw(U128(6_000_000));
    }

    const HOUR: u64 = 3_600_000_000_000;

    fn fail_attempt(contract: &mut Contract, job_id: U64) {
        vote_as(contract, job_id, "r1.testnet", false);
        vote_as(contract, job_id, "r2.testnet", false);
    }

    fn redeliver(contract: &mut Contract, job_id: U64, commit: &str) {
        call_at("agents.veteran.testnet", 0, 0);
        contract.submit_delivery(job_id, commit.to_string());
    }

    fn disputed_with_recheck(contract: &mut Contract, approve: bool) -> U64 {
        let job_id = delivered_job(contract);
        call_at("alice.testnet", 0, 0);
        contract.open_dispute(job_id, "The fix hard-codes the test values".to_string());
        vote_as(contract, job_id, "r1.testnet", approve);
        vote_as(contract, job_id, "r2.testnet", approve);
        job_id
    }

    fn bond(contract: &mut Contract, from: &str, job_id: U64, amount: u128, at: u64) {
        call_at("usdc.testnet", 0, at);
        let _ = contract.ft_on_transfer(
            acc(from),
            U128(amount),
            format!("dispute_bond:{}", job_id.0),
        );
    }

    fn released_job(contract: &mut Contract) -> U64 {
        let job_id = delivered_job(contract);
        vote_as(contract, job_id, "r1.testnet", true);
        vote_as(contract, job_id, "r2.testnet", true);
        job_id
    }

    #[test]
    fn rerun_after_split_vote_clears_votes() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        vote_as(&mut contract, job_id, "r1.testnet", true);
        vote_as(&mut contract, job_id, "r2.testnet", false);
        call_at("anyone.testnet", 0, 0);
        contract.rerun_review(job_id);
        let job = contract.get_job(job_id).unwrap();
        assert_eq!(job.stage, JobStage::Delivered);
        assert_eq!(job.review_round, 2);
        assert!(job.votes.is_empty());
    }

    #[test]
    #[should_panic(expected = "A rerun needs a split vote or the review timeout")]
    fn rerun_too_early_fails() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("anyone.testnet", 0, 11 * HOUR);
        contract.rerun_review(job_id);
    }

    #[test]
    fn rerun_after_review_timeout() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("anyone.testnet", 0, 12 * HOUR);
        contract.rerun_review(job_id);
        assert_eq!(contract.get_job(job_id).unwrap().review_round, 2);
    }

    #[test]
    fn refund_after_last_attempt_fails() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        fail_attempt(&mut contract, job_id);
        redeliver(&mut contract, job_id, "commit-2");
        fail_attempt(&mut contract, job_id);
        call_at("agents.alice.testnet", 0, 0);
        contract.refund_milestone(job_id);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Refunded);
        let buyer = contract.get_balance(acc("alice.testnet"));
        assert_eq!(buyer.free.0, 200_000_000);
        assert_eq!(buyer.escrowed.0, 0);
    }

    #[test]
    #[should_panic(expected = "Refund is allowed after the last attempt fails")]
    fn refund_with_attempts_left_fails() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        fail_attempt(&mut contract, job_id);
        call_at("alice.testnet", 0, 0);
        contract.refund_milestone(job_id);
    }

    #[test]
    fn grant_attempt_lets_the_seller_try_again() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        fail_attempt(&mut contract, job_id);
        redeliver(&mut contract, job_id, "commit-2");
        fail_attempt(&mut contract, job_id);
        call_at("alice.testnet", 0, 0);
        contract.grant_attempt(job_id);
        assert_eq!(contract.get_job(job_id).unwrap().attempts_left, 1);
        redeliver(&mut contract, job_id, "commit-3");
        assert_eq!(contract.get_job(job_id).unwrap().attempt, 3);
    }

    #[test]
    #[should_panic(expected = "Only the buyer can grant an attempt")]
    fn seller_cannot_grant_an_attempt() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("veteran.testnet", 0, 0);
        contract.grant_attempt(job_id);
    }

    #[test]
    fn dispute_freezes_job_and_starts_free_recheck() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        vote_as(&mut contract, job_id, "r1.testnet", true);
        call_at("alice.testnet", 0, 0);
        contract.open_dispute(job_id, "Tests pass on a hard-coded value".to_string());
        let job = contract.get_job(job_id).unwrap();
        assert_eq!(job.stage, JobStage::Disputed);
        assert!(job.votes.is_empty());
        assert_eq!(contract.get_reputation(acc("veteran.testnet")).disputes, 1);
        assert_eq!(
            contract.get_dispute(job_id).unwrap().opened_by,
            acc("alice.testnet")
        );
    }

    #[test]
    #[should_panic(expected = "Only a delivered job can be disputed")]
    fn released_job_cannot_be_disputed() {
        let mut contract = funded_setup();
        let job_id = released_job(&mut contract);
        call_at("alice.testnet", 0, 0);
        contract.open_dispute(job_id, "late".to_string());
    }

    #[test]
    #[should_panic(expected = "Only the buyer or seller can open a dispute")]
    fn stranger_cannot_dispute() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("mallory.testnet", 0, 0);
        contract.open_dispute(job_id, "no".to_string());
    }

    #[test]
    fn recheck_result_stands_after_72_hours() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        assert_eq!(
            contract.get_dispute(job_id).unwrap().recheck,
            Some("release".to_string())
        );
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Disputed);
        call_at("anyone.testnet", 0, 72 * HOUR);
        contract.finalize_default(job_id);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Released);
        assert_eq!(
            contract.get_balance(acc("veteran.testnet")).free.0,
            31_360_000
        );
        assert_eq!(
            contract.get_dispute(job_id).unwrap().outcome,
            Some("release".to_string())
        );
    }

    #[test]
    #[should_panic(expected = "Wait 72 hours before finalizing")]
    fn finalize_too_early_fails() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        call_at("anyone.testnet", 0, 71 * HOUR);
        contract.finalize_default(job_id);
    }

    #[test]
    fn dao_upholds_buyer_claim_and_returns_bond() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        bond(&mut contract, "alice.testnet", job_id, 1_600_000, HOUR);
        let dispute = contract.get_dispute(job_id).unwrap();
        assert_eq!(dispute.claim, Some("refund".to_string()));
        assert_eq!(dispute.bond.0, 1_600_000);
        call_at("dao.testnet", 0, 2 * HOUR);
        contract.resolve_dispute(job_id, "refund".to_string(), 0);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Refunded);
        let buyer = contract.get_balance(acc("alice.testnet"));
        assert_eq!(buyer.free.0, 201_600_000);
        assert_eq!(buyer.escrowed.0, 0);
    }

    #[test]
    fn unanswered_escalation_falls_back_and_forfeits_bond() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        bond(&mut contract, "alice.testnet", job_id, 1_600_000, HOUR);
        call_at("anyone.testnet", 0, 73 * HOUR);
        contract.finalize_default(job_id);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Released);
        assert_eq!(
            contract.get_balance(acc("dao.testnet")).free.0,
            640_000 + 1_600_000
        );
    }

    #[test]
    fn dao_splits_the_payment() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, false);
        bond(&mut contract, "veteran.testnet", job_id, 1_600_000, HOUR);
        call_at("dao.testnet", 0, 2 * HOUR);
        contract.resolve_dispute(job_id, "split".to_string(), 7_000);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Released);
        assert_eq!(
            contract.get_balance(acc("veteran.testnet")).free.0,
            21_952_000 + 1_600_000
        );
        assert_eq!(contract.get_balance(acc("dao.testnet")).free.0, 448_000);
        assert_eq!(
            contract.get_balance(acc("alice.testnet")).free.0,
            168_000_000 + 9_600_000
        );
    }

    #[test]
    #[should_panic(expected = "Bond is below 5% of the price (minimum 1 USDC)")]
    fn small_bond_fails() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        bond(&mut contract, "alice.testnet", job_id, 1_500_000, HOUR);
    }

    #[test]
    #[should_panic(expected = "The re-check already agrees with you")]
    fn winner_cannot_escalate() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        bond(&mut contract, "veteran.testnet", job_id, 2_000_000, HOUR);
    }

    #[test]
    #[should_panic(expected = "Wait for the re-check result")]
    fn escalate_before_recheck_fails() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("alice.testnet", 0, 0);
        contract.open_dispute(job_id, "bad".to_string());
        bond(&mut contract, "alice.testnet", job_id, 2_000_000, HOUR);
    }

    #[test]
    #[should_panic(expected = "The escalation window has closed")]
    fn escalate_after_window_fails() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        bond(&mut contract, "alice.testnet", job_id, 2_000_000, 72 * HOUR);
    }

    #[test]
    #[should_panic(expected = "Only the DAO can resolve a dispute")]
    fn only_dao_resolves() {
        let mut contract = funded_setup();
        let job_id = disputed_with_recheck(&mut contract, true);
        bond(&mut contract, "alice.testnet", job_id, 1_600_000, HOUR);
        call_at("alice.testnet", 0, 2 * HOUR);
        contract.resolve_dispute(job_id, "refund".to_string(), 0);
    }

    #[test]
    #[should_panic(expected = "Job is not under review")]
    fn no_votes_after_escalation() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("alice.testnet", 0, 0);
        contract.open_dispute(job_id, "bad".to_string());
        vote_as(&mut contract, job_id, "r1.testnet", true);
        vote_as(&mut contract, job_id, "r2.testnet", true);
        vote_as(&mut contract, job_id, "r3.testnet", true);
    }

    #[test]
    fn each_side_rates_once() {
        let mut contract = funded_setup();
        let job_id = released_job(&mut contract);
        call_at("alice.testnet", 0, 0);
        contract.rate(job_id, 5);
        let seller = contract.get_reputation(acc("veteran.testnet"));
        assert_eq!((seller.rating_sum, seller.rating_count), (30, 6));
        call_at("veteran.testnet", 0, 0);
        contract.rate(job_id, 4);
        let buyer = contract.get_reputation(acc("alice.testnet"));
        assert_eq!((buyer.rating_sum, buyer.rating_count), (4, 1));
    }

    #[test]
    #[should_panic(expected = "You already rated this job")]
    fn rating_twice_fails() {
        let mut contract = funded_setup();
        let job_id = released_job(&mut contract);
        call_at("alice.testnet", 0, 0);
        contract.rate(job_id, 5);
        contract.rate(job_id, 1);
    }

    #[test]
    #[should_panic(expected = "Only a paid job can be rated")]
    fn unpaid_job_cannot_be_rated() {
        let mut contract = funded_setup();
        let job_id = delivered_job(&mut contract);
        call_at("alice.testnet", 0, 0);
        contract.rate(job_id, 5);
    }

    #[test]
    fn starter_stake_lifts_the_new_seller_cap() {
        let mut contract = admin_setup();
        deposit(&mut contract, "alice.testnet", 200_000_000);
        call_at("usdc.testnet", 0, 0);
        let _ = contract.ft_on_transfer(
            acc("seller.testnet"),
            U128(10_000_000),
            "starter_stake".to_string(),
        );
        assert_eq!(contract.get_stake(acc("seller.testnet")).0, 10_000_000);
        let job_id = hired_job(&mut contract, 40_000_000, "seller.testnet", 0);
        call_at("agents.alice.testnet", 0, 0);
        contract.fund_job(job_id);
        assert_eq!(contract.get_job(job_id).unwrap().stage, JobStage::Funded);
    }

    #[test]
    #[should_panic(expected = "Only a registered seller can stake")]
    fn unregistered_account_cannot_stake() {
        let mut contract = admin_setup();
        call_at("usdc.testnet", 0, 0);
        let _ = contract.ft_on_transfer(
            acc("nobody.testnet"),
            U128(10_000_000),
            "starter_stake".to_string(),
        );
    }

    #[test]
    fn stake_returns_after_three_clean_jobs() {
        let mut contract = admin_setup();
        call_at("usdc.testnet", 0, 0);
        let _ = contract.ft_on_transfer(
            acc("seller.testnet"),
            U128(10_000_000),
            "starter_stake".to_string(),
        );
        contract.reputations.insert(
            acc("seller.testnet"),
            Reputation {
                settled: 3,
                disputes: 0,
                rating_sum: 0,
                rating_count: 0,
            },
        );
        call_at("seller.testnet", 0, 0);
        contract.return_stake();
        assert_eq!(contract.get_stake(acc("seller.testnet")).0, 0);
        assert_eq!(
            contract.get_balance(acc("seller.testnet")).free.0,
            10_000_000
        );
    }

    #[test]
    #[should_panic(expected = "The stake comes back after 3 settled jobs with no disputes")]
    fn stake_stays_before_three_jobs() {
        let mut contract = admin_setup();
        call_at("usdc.testnet", 0, 0);
        let _ = contract.ft_on_transfer(
            acc("seller.testnet"),
            U128(10_000_000),
            "starter_stake".to_string(),
        );
        call_at("seller.testnet", 0, 0);
        contract.return_stake();
    }

    #[test]
    fn release_mints_a_completion_record() {
        let mut contract = funded_setup();
        let job_id = released_job(&mut contract);
        assert_eq!(contract.nft_total_supply().0, 1);
        assert_eq!(contract.nft_supply_for_owner(acc("veteran.testnet")).0, 1);
        let token = contract.nft_token("1".to_string()).unwrap();
        assert_eq!(token.owner_id, acc("veteran.testnet"));
        assert_eq!(token.metadata.title, format!("Completed job {}", job_id.0));
        assert_eq!(
            contract
                .nft_tokens_for_owner(acc("veteran.testnet"), None, None)
                .len(),
            1
        );
        assert_eq!(contract.nft_metadata().spec, "nft-1.0.0");
    }

    #[test]
    #[should_panic(expected = "Completion records are non-transferable")]
    fn completion_record_cannot_move() {
        let mut contract = funded_setup();
        released_job(&mut contract);
        call_at("veteran.testnet", 1, 0);
        contract.nft_transfer(acc("buyer.testnet"), "1".to_string(), None, None);
    }

    #[test]
    #[should_panic(expected = "Only the config owner")]
    fn only_owner_sets_proposal_bond() {
        let mut contract = setup();
        call_from("alice.testnet", 1);
        contract.set_proposal_bond(U128(1));
    }
}
