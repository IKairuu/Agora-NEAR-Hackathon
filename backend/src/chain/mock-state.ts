const usdc = (amount: number): string => String(Math.round(amount * 1_000_000));

export const mockViews: Record<string, (args: Record<string, unknown>) => unknown> = {
    get_config: () => ({
        owner_id: 'agora-testnet.testnet',
        usdc_token: 'usdc.fakes.testnet',
        dao_account: 'agora-dao.sputnikv2.testnet',
        fee_bps: 200,
    }),
    is_paused: () => false,
    get_balance: () => ({ free: usdc(120), escrowed: usdc(0) }),
    get_mandate: (args) => ({
        account_id: args['account_id'] ?? null,
        per_job_cap: usdc(50),
        daily_cap: usdc(120),
        new_seller_cap: usdc(25),
        review_timeout_hours: 12,
        categories: ['rust', 'fe', 'tests'],
        strict: false,
        approved_sellers: [],
        paused: false,
    }),
    get_used_today: () => usdc(0),
    get_job: (args) => ({
        job_id: args['job_id'] ?? '1',
        buyer: 'lumen.testnet',
        category: 'rust',
        stage: 'Requested',
        price: null,
        seller: null,
    }),
    get_bids: () => [],
    get_votes: () => [],
    get_reputation: (args) => ({
        account_id: args['account_id'] ?? null,
        settled: 0,
        disputes: 0,
        rating_sum: 0,
        rating_count: 0,
    }),
};

export const mockIdMethods = ['post_job', 'place_bid'];
