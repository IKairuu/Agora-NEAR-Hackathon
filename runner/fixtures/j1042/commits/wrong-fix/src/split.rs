#[derive(Debug, PartialEq, Eq)]
pub enum SplitError {
    NoWorkers,
    ZeroWeight,
}

pub fn split_payment(total: u128, weights: &[u32]) -> Result<Vec<u128>, SplitError> {
    if weights.is_empty() {
        return Err(SplitError::NoWorkers);
    }
    let sum: u128 = weights.iter().map(|w| *w as u128).sum();
    if sum == 0 {
        return Err(SplitError::ZeroWeight);
    }
    let mut parts: Vec<u128> = weights.iter().map(|w| total * *w as u128 / sum).collect();
    let paid: u128 = parts.iter().sum();
    if let Some(first) = parts.first_mut() {
        *first += total - paid;
    }
    Ok(parts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn even_split() {
        assert_eq!(split_payment(90, &[1, 1, 1]), Ok(vec![30, 30, 30]));
    }

    #[test]
    fn single_worker_gets_all() {
        assert_eq!(split_payment(100, &[5]), Ok(vec![100]));
    }

    #[test]
    fn zero_total() {
        assert_eq!(split_payment(0, &[2, 3]), Ok(vec![0, 0]));
    }

    #[test]
    fn no_workers_rejected() {
        assert_eq!(split_payment(10, &[]), Err(SplitError::NoWorkers));
    }

    #[test]
    fn zero_weight_rejected() {
        assert_eq!(split_payment(10, &[0, 0]), Err(SplitError::ZeroWeight));
    }
}
