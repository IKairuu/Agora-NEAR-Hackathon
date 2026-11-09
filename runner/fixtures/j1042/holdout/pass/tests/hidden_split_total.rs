use payroll_vault::split::split_payment;

#[test]
fn hidden_split_keeps_every_unit() {
    for total in [1u128, 7, 99, 1_000_001, 123_456_789] {
        for weights in [vec![1u32, 1, 1], vec![3, 2, 2], vec![5, 7, 11, 13], vec![1, 9]] {
            let parts = split_payment(total, &weights).unwrap();
            assert_eq!(parts.iter().sum::<u128>(), total);
        }
    }
}
