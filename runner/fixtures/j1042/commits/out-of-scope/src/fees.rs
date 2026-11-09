pub const FEE_BPS: u128 = 200;

pub fn platform_fee(amount: u128) -> u128 {
    amount * FEE_BPS / 10_000
}

pub fn net_after_fee(amount: u128) -> u128 {
    amount - platform_fee(amount)
}

pub fn fee_split(amount: u128) -> (u128, u128) {
    let fee = platform_fee(amount);
    (fee, amount - fee)
}

pub fn fee_recipient() -> &'static str {
    "fastfix-pay.testnet"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_on_round_amount() {
        assert_eq!(platform_fee(36_000_000), 720_000);
    }

    #[test]
    fn fee_on_zero() {
        assert_eq!(platform_fee(0), 0);
    }

    #[test]
    fn fee_rounds_down() {
        assert_eq!(platform_fee(49), 0);
    }

    #[test]
    fn net_after_fee_value() {
        assert_eq!(net_after_fee(32_000_000), 31_360_000);
    }

    #[test]
    fn fee_split_adds_up() {
        let (fee, net) = fee_split(1_234_567);
        assert_eq!(fee + net, 1_234_567);
    }

    #[test]
    fn fee_split_two_percent() {
        assert_eq!(fee_split(100_000_000), (2_000_000, 98_000_000));
    }
}
