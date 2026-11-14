// Test USDC for the AGORA testnet demo: a standard NEP-141 token with 6 decimals.
// The owner gets the whole supply and can mint more for demo accounts.
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, PromiseOrValue};

/// Faucet: 50 test USDC (6 decimals) per claim, one claim per account per 24 hours.
const FAUCET_AMOUNT: u128 = 50_000_000;
const FAUCET_COOLDOWN_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    token: FungibleToken,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, total_supply: U128) -> Self {
        let mut token = FungibleToken::new(b"t".to_vec());
        token.internal_register_account(&owner);
        token.internal_deposit(&owner, total_supply.0);
        Self { owner, token }
    }

    /// Owner only: mint test USDC to any account (registers it if needed).
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
    }

    /// Anyone: registers the caller if needed and gives them 50 test USDC, once per 24 hours.
    /// The token contract pays the storage. The last claim time sits in raw storage (key "F:<account>"),
    /// so the contract state layout is unchanged and this upgrades in place.
    pub fn faucet(&mut self) -> U128 {
        let account_id = env::predecessor_account_id();
        let key = [b"F:".as_slice(), account_id.as_bytes()].concat();
        let now = env::block_timestamp();
        if let Some(raw) = env::storage_read(&key) {
            let last = u64::from_le_bytes(raw.try_into().unwrap_or([0; 8]));
            let next = last.saturating_add(FAUCET_COOLDOWN_NS);
            require!(now >= next, format!("faucet: one claim per 24 hours, try again in {} minutes", (next - now) / 60_000_000_000 + 1));
        }
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, FAUCET_AMOUNT);
        env::storage_write(&key, &now.to_le_bytes());
        near_sdk::log!("faucet: {} USDC to {}", FAUCET_AMOUNT / 1_000_000, account_id);
        U128(self.token.ft_balance_of(account_id).0)
    }

    pub fn faucet_next_claim(&self, account_id: AccountId) -> u64 {
        let key = [b"F:".as_slice(), account_id.as_bytes()].concat();
        env::storage_read(&key).map(|raw| u64::from_le_bytes(raw.try_into().unwrap_or([0; 8])).saturating_add(FAUCET_COOLDOWN_NS)).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn ctx(who: &str, ts: u64) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(who.parse().unwrap()).block_timestamp(ts).build());
    }

    #[test]
    fn faucet_registers_and_pays_once_a_day() {
        ctx("owner.testnet", 1);
        let mut c = Contract::new("owner.testnet".parse().unwrap(), U128(1_000_000_000));
        ctx("judge.testnet", 10);
        assert_eq!(c.faucet().0, 50_000_000);
        assert_eq!(c.ft_balance_of("judge.testnet".parse().unwrap()).0, 50_000_000);
        assert_eq!(c.faucet_next_claim("judge.testnet".parse().unwrap()), 10 + FAUCET_COOLDOWN_NS);
        ctx("judge.testnet", 10 + FAUCET_COOLDOWN_NS);
        assert_eq!(c.faucet().0, 100_000_000);
        assert_eq!(c.ft_total_supply().0, 1_100_000_000);
    }

    #[test]
    #[should_panic(expected = "one claim per 24 hours")]
    fn faucet_refuses_a_second_claim_the_same_day() {
        ctx("owner.testnet", 1);
        let mut c = Contract::new("owner.testnet".parse().unwrap(), U128(1));
        ctx("judge.testnet", 10);
        c.faucet();
        ctx("judge.testnet", 20);
        c.faucet();
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }
    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.storage_unregister(force)
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Test USDC (AGORA demo)".to_string(),
            symbol: "USDC".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}
