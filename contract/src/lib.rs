use near_sdk::{near, AccountId, PanicOnDefault};

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Config {
    pub owner_id: AccountId,
    pub usdc_token: AccountId,
    pub dao_account: AccountId,
    pub fee_bps: u16,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    config: Config,
    paused: bool,
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
        }
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    #[test]
    fn init_sets_config() {
        let contract = Contract::new(acc("owner.testnet"), acc("usdc.testnet"), acc("dao.testnet"));
        let config = contract.get_config();
        assert_eq!(config.owner_id, acc("owner.testnet"));
        assert_eq!(config.usdc_token, acc("usdc.testnet"));
        assert_eq!(config.dao_account, acc("dao.testnet"));
        assert_eq!(config.fee_bps, 200);
        assert!(!contract.is_paused());
    }
}