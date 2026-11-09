use payroll_vault::split::split_payment;

#[test]
fn test_split_rounding() {
    let total = 1_000_000;
    let parts = split_payment(total, &[1, 1, 1]).unwrap();
    assert_eq!(parts.iter().sum::<u128>(), total);
}

#[test]
fn test_split_dust_to_last() {
    let parts = split_payment(100, &[3, 2, 2]).unwrap();
    assert_eq!(parts, vec![42, 28, 30]);
}
