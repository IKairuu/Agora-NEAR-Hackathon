use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas,
    NearToken, PanicOnDefault, PromiseError, PromiseOrValue,
};

const USDC: u128 = 1_000_000;
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
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Config {
    pub owner_id: AccountId,
    pub usdc_token: AccountId,
    pub dao_account: AccountId,
    pub fee_bps: u16,
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
            },
            balances: LookupMap::new(StorageKey::Balances),
            mandates: LookupMap::new(StorageKey::Mandates),
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
