use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas,
    NearToken, PanicOnDefault, PromiseError, PromiseOrValue,
};

const USDC: u128 = 1_000_000;
const MAX_BIDS_PER_JOB: usize = 20;
const MAX_OPEN_BIDS_PER_SELLER: u32 = 10;
const HIGH_FRAUD_SCORE: u8 = 70;
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_WITHDRAW_CALLBACK: Gas = Gas::from_tgas(10);

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
    fn require_config_owner(&self) {
        require!(env::predecessor_account_id() == self.config.owner_id, "Only the config owner");
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
            },
            balances: LookupMap::new(StorageKey::Balances),
            mandates: LookupMap::new(StorageKey::Mandates),
            sellers: LookupSet::new(StorageKey::Sellers),
            open_bids: LookupMap::new(StorageKey::OpenBids),
            jobs: LookupMap::new(StorageKey::Jobs),
            bids: LookupMap::new(StorageKey::Bids),
            next_job_id: 1,
            next_bid_id: 1,
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
        require!(per_job_cap.0 <= daily_cap.0, "Per-job cap cannot exceed daily cap");
        require!(new_seller_cap.0 <= per_job_cap.0, "New-seller cap cannot exceed per-job cap");
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

    pub fn post_job(&mut self, category: String, budget_hint: U128, spec_hash: String, deadline: U64) -> U64 {
        let buyer = owner_of(&env::predecessor_account_id());
        require!(!category.is_empty(), "Category is required");
        require!(!spec_hash.is_empty(), "Spec hash is required");
        require!(deadline.0 > env::block_timestamp(), "Deadline must be in the future");
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
        let mut job = self.jobs.get(&job_id.0).cloned().unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.stage == JobStage::Open, "Job is not open for bids");
        require!(job.buyer != seller, "Cannot bid on your own job");
        require!(job.bid_ids.len() < MAX_BIDS_PER_JOB, "Too many bids on this job");
        let already = job
            .bid_ids
            .iter()
            .any(|id| self.bids.get(&id.0).map(|b| b.seller == seller).unwrap_or(false));
        require!(!already, "Seller already bid on this job");
        let open = self.open_bids.get(&seller).copied().unwrap_or(0);
        require!(open < MAX_OPEN_BIDS_PER_SELLER, "Too many open bids for this seller");
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

    pub fn set_bid_flags(&mut self, job_id: U64, bid_id: U64, price_check_ok: bool, fraud_score: u8, held: bool) {
        let oracle = self.config.fraud_oracle.clone().unwrap_or_else(|| env::panic_str("No fraud oracle set"));
        require!(env::predecessor_account_id() == oracle, "Only the fraud oracle can flag bids");
        require!(fraud_score <= 100, "Fraud score is 0 to 100");
        let mut bid = self.bids.get(&bid_id.0).cloned().unwrap_or_else(|| env::panic_str("Bid not found"));
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

    pub fn get_balance(&self, account_id: AccountId) -> Balance {
        self.balances.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.config.usdc_token,
            "Only the USDC token can deposit"
        );
        require!(amount.0 > 0, "Amount must be positive");
        require!(msg == "deposit" || msg.is_empty(), "Unsupported deposit message");
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
            .ft_transfer(account_id.clone(), amount, Some("AGORA withdraw".to_string()))
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

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn acc(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn setup() -> Contract {
        Contract::new(acc("owner.testnet"), acc("usdc.testnet"), acc("dao.testnet"))
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
        contract.post_job("rust".to_string(), U128(40_000_000), "spec-hash-1".to_string(), U64(10_000))
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
        assert_eq!(contract.get_balance(acc("alice.testnet")).free.0, 30_000_000);
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
}
