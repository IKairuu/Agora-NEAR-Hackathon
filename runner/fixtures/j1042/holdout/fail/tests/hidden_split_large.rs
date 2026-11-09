use payroll_vault::split::split_payment;

#[test]
fn hidden_split_large_total() {
    let total = u128::MAX / 2;
    let parts = split_payment(total, &[3, 1]).unwrap();
    assert_eq!(parts.iter().sum::<u128>(), total);
}
