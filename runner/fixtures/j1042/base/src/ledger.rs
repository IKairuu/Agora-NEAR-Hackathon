use std::collections::HashMap;

#[derive(Debug, PartialEq, Eq)]
pub enum LedgerError {
    Insufficient,
    UnknownEscrow,
    ZeroAmount,
}

#[derive(Default)]
pub struct Ledger {
    free: HashMap<String, u128>,
    escrow: HashMap<u64, (String, u128)>,
    next_id: u64,
}

impl Ledger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn balance(&self, account: &str) -> u128 {
        *self.free.get(account).unwrap_or(&0)
    }

    pub fn deposit(&mut self, account: &str, amount: u128) -> Result<(), LedgerError> {
        if amount == 0 {
            return Err(LedgerError::ZeroAmount);
        }
        *self.free.entry(account.to_string()).or_insert(0) += amount;
        Ok(())
    }

    pub fn withdraw(&mut self, account: &str, amount: u128) -> Result<(), LedgerError> {
        if amount == 0 {
            return Err(LedgerError::ZeroAmount);
        }
        let balance = self.free.entry(account.to_string()).or_insert(0);
        if *balance < amount {
            return Err(LedgerError::Insufficient);
        }
        *balance -= amount;
        Ok(())
    }

    pub fn lock(&mut self, account: &str, amount: u128) -> Result<u64, LedgerError> {
        self.withdraw(account, amount)?;
        let id = self.next_id;
        self.next_id += 1;
        self.escrow.insert(id, (account.to_string(), amount));
        Ok(id)
    }

    pub fn escrowed(&self, id: u64) -> Option<u128> {
        self.escrow.get(&id).map(|(_, amount)| *amount)
    }

    pub fn release(&mut self, id: u64, to: &str) -> Result<u128, LedgerError> {
        let (_, amount) = self.escrow.remove(&id).ok_or(LedgerError::UnknownEscrow)?;
        *self.free.entry(to.to_string()).or_insert(0) += amount;
        Ok(amount)
    }

    pub fn refund(&mut self, id: u64) -> Result<u128, LedgerError> {
        let (owner, amount) = self.escrow.remove(&id).ok_or(LedgerError::UnknownEscrow)?;
        *self.free.entry(owner).or_insert(0) += amount;
        Ok(amount)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deposit_adds() {
        let mut l = Ledger::new();
        l.deposit("lumen.testnet", 36_000_000).unwrap();
        assert_eq!(l.balance("lumen.testnet"), 36_000_000);
    }

    #[test]
    fn deposit_zero_rejected() {
        let mut l = Ledger::new();
        assert_eq!(l.deposit("lumen.testnet", 0), Err(LedgerError::ZeroAmount));
    }

    #[test]
    fn withdraw_subtracts() {
        let mut l = Ledger::new();
        l.deposit("lumen.testnet", 10_000_000).unwrap();
        l.withdraw("lumen.testnet", 4_000_000).unwrap();
        assert_eq!(l.balance("lumen.testnet"), 6_000_000);
    }

    #[test]
    fn withdraw_insufficient() {
        let mut l = Ledger::new();
        l.deposit("lumen.testnet", 1_000_000).unwrap();
        assert_eq!(l.withdraw("lumen.testnet", 2_000_000), Err(LedgerError::Insufficient));
    }

    #[test]
    fn lock_moves_to_escrow() {
        let mut l = Ledger::new();
        l.deposit("lumen.testnet", 40_000_000).unwrap();
        let id = l.lock("lumen.testnet", 32_000_000).unwrap();
        assert_eq!(l.balance("lumen.testnet"), 8_000_000);
        assert_eq!(l.escrowed(id), Some(32_000_000));
    }

    #[test]
    fn release_pays_seller() {
        let mut l = Ledger::new();
        l.deposit("lumen.testnet", 32_000_000).unwrap();
        let id = l.lock("lumen.testnet", 32_000_000).unwrap();
        assert_eq!(l.release(id, "patchsmith.testnet"), Ok(32_000_000));
        assert_eq!(l.balance("patchsmith.testnet"), 32_000_000);
    }

    #[test]
    fn refund_returns_to_owner() {
        let mut l = Ledger::new();
        l.deposit("lumen.testnet", 20_000_000).unwrap();
        let id = l.lock("lumen.testnet", 20_000_000).unwrap();
        l.refund(id).unwrap();
        assert_eq!(l.balance("lumen.testnet"), 20_000_000);
    }

    #[test]
    fn release_twice_fails() {
        let mut l = Ledger::new();
        l.deposit("lumen.testnet", 5_000_000).unwrap();
        let id = l.lock("lumen.testnet", 5_000_000).unwrap();
        l.release(id, "patchsmith.testnet").unwrap();
        assert_eq!(l.release(id, "patchsmith.testnet"), Err(LedgerError::UnknownEscrow));
    }
}
