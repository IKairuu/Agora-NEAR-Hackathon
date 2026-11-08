use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas,
    NearToken, PanicOnDefault, PromiseError, PromiseOrValue,
};

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

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    config: Config,
    paused: bool,
    balances: LookupMap<AccountId, Balance>,
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
            paused: false,
            balances: LookupMap::new(StorageKey::Balances),
        }
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn is_paused(&self) -> bool {
        self.paused
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
        assert!(!contract.is_paused());
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
