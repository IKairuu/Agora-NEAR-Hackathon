use payroll_vault::fees::net_after_fee;
use payroll_vault::ledger::{Ledger, LedgerError};
use payroll_vault::split::split_payment;
use payroll_vault::units::{format_units, parse_units};

#[test]
fn fund_and_release_full_job() {
    let mut l = Ledger::new();
    l.deposit("lumen.testnet", 36_000_000).unwrap();
    let id = l.lock("lumen.testnet", 36_000_000).unwrap();
    l.release(id, "patchsmith.testnet").unwrap();
    assert_eq!(l.balance("patchsmith.testnet"), 36_000_000);
    assert_eq!(l.balance("lumen.testnet"), 0);
}

#[test]
fn refund_restores_buyer() {
    let mut l = Ledger::new();
    l.deposit("lumen.testnet", 45_000_000).unwrap();
    let id = l.lock("lumen.testnet", 45_000_000).unwrap();
    assert_eq!(l.refund(id), Ok(45_000_000));
    assert_eq!(l.balance("lumen.testnet"), 45_000_000);
}

#[test]
fn fee_then_split_even() {
    let net = net_after_fee(30_000_000);
    assert_eq!(split_payment(net, &[1, 1]), Ok(vec![14_700_000, 14_700_000]));
}

#[test]
fn split_two_workers_even() {
    assert_eq!(split_payment(10_000_000, &[1, 1]), Ok(vec![5_000_000, 5_000_000]));
}

#[test]
fn parse_and_format_round_trip() {
    assert_eq!(format_units(parse_units("36.5").unwrap()), "36.500000");
}

#[test]
fn cannot_overdraw_after_lock() {
    let mut l = Ledger::new();
    l.deposit("lumen.testnet", 10_000_000).unwrap();
    l.lock("lumen.testnet", 8_000_000).unwrap();
    assert_eq!(l.withdraw("lumen.testnet", 5_000_000), Err(LedgerError::Insufficient));
}
