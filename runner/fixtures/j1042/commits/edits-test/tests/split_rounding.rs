use payroll_vault::split::split_payment;

#[test]
fn test_split_rounding() {
    let parts = split_payment(1_000_000, &[1, 1, 1]).unwrap();
    assert_eq!(parts.len(), 3);
}

#[test]
fn test_split_dust_to_last() {
    assert!(split_payment(100, &[3, 2, 2]).is_ok());
}
