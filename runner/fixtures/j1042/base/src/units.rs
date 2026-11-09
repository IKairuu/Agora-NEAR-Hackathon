pub const DECIMALS: usize = 6;
pub const ONE_USDC: u128 = 1_000_000;

pub fn to_units(whole: u128, micros: u128) -> Option<u128> {
    if micros >= ONE_USDC {
        return None;
    }
    whole.checked_mul(ONE_USDC)?.checked_add(micros)
}

pub fn format_units(units: u128) -> String {
    format!("{}.{:06}", units / ONE_USDC, units % ONE_USDC)
}

pub fn parse_units(text: &str) -> Option<u128> {
    let (whole, frac) = text.split_once('.').unwrap_or((text, ""));
    if whole.is_empty() || frac.len() > DECIMALS {
        return None;
    }
    if !whole.chars().all(|c| c.is_ascii_digit()) || !frac.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let whole: u128 = whole.parse().ok()?;
    let micros: u128 = if frac.is_empty() { 0 } else { format!("{:0<6}", frac).parse().ok()? };
    to_units(whole, micros)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_units_basic() {
        assert_eq!(to_units(36, 500_000), Some(36_500_000));
    }

    #[test]
    fn to_units_rejects_overflowing_micros() {
        assert_eq!(to_units(1, 1_000_000), None);
    }

    #[test]
    fn format_whole() {
        assert_eq!(format_units(36_000_000), "36.000000");
    }

    #[test]
    fn format_fraction() {
        assert_eq!(format_units(32_500_000), "32.500000");
    }

    #[test]
    fn parse_short_fraction() {
        assert_eq!(parse_units("32.5"), Some(32_500_000));
    }

    #[test]
    fn parse_rejects_bad_input() {
        assert_eq!(parse_units("1.1234567"), None);
        assert_eq!(parse_units("abc"), None);
        assert_eq!(parse_units(".5"), None);
    }
}
