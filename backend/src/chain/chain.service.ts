import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Account, actions, JsonRpcProvider, KeyPair, KeyPairEd25519, KeyPairSigner, KeyPairString, nearToYocto, teraToGas } from 'near-api-js';
import { verifyMessage } from 'near-api-js/nep413';
import { IndexerService, jobKeyOf, jobRefOf, bondJobOf, MockCall, ownerOf, usdcOf } from '../indexer/indexer.service.js';
import { ChainRepository, GAS_TOPUP } from './chain.repository.js';
import { mockIdMethods, mockViews } from './mock-state.js';

export type ChainRole = 'owner' | 'transaction_agent' | 'guardian' | 'fraud_oracle' | 'reviewer' | 'platform' | 'dao';

export interface ChainCallResult {
    tx_hash: string;
    explorer_url: string;
    ok: boolean;
    result: unknown;
}

export interface UnsignedTx {
    unsigned_tx_base64: string;
}

export interface CreatedAccount {
    account_id: string;
    agents_account_id: string;
}

export interface TxOutcome {
    txHash: string;
    ok: boolean;
    result: unknown;
    error: string | null;
}

export const ROLE_KEY_ENV: Partial<Record<ChainRole, string>> = {
    platform: 'AGORA_PLATFORM_PRIVATE_KEY',
    guardian: 'AGORA_GUARDIAN_PRIVATE_KEY',
    fraud_oracle: 'AGORA_FRAUD_ORACLE_PRIVATE_KEY',
    reviewer: 'AGORA_REVIEWER_PRIVATE_KEY',
    dao: 'AGORA_DAO_PRIVATE_KEY',
};

export const HEAVY_METHODS = ['ft_transfer_call', 'withdraw', 'resolve_dispute', 'finalize_default'];
export const DEFAULT_TGAS = 100;
export const HEAVY_TGAS = 300;
const NS_PER_DAY = 86_400_000_000_000n;

/** What the server spends to make a wallet-less user real on NEAR (testnet), and the starter USDC it deposits. */
export const ACCOUNT_NEAR = '0.5';
export const AGENTS_NEAR = '0.25';
export const AGENTS_ALLOWANCE_NEAR = '0.25';
export const STARTER_DEPOSIT_UNITS = 40_000_000n;
/** A new wallet with less NEAR than this gets one gift of GAS_TOPUP_NEAR before Enable agents; at most GAS_TOPUP_DAILY_CAP a day. */
export const GAS_TOPUP_MIN_NEAR = '0.4';
export const GAS_TOPUP_NEAR = '0.4';
export const GAS_TOPUP_DAILY_CAP = 20;
/** Everything an agents.<owner> key may call: the buyer's job methods, the seller's bid and delivery, and the guardian's pause. */
export const AGENT_METHODS = ['post_job', 'accept_offer', 'fund_job', 'refund_milestone', 'grant_attempt', 'rate', 'place_bid', 'submit_delivery', 'open_dispute', 'pause'];

export const vaultKeyName = (accountId: string): string => `near_key:${accountId}`;

export const gasFor = (method: string): bigint => teraToGas(HEAVY_METHODS.includes(method) ? HEAVY_TGAS : DEFAULT_TGAS);

export const usdcUnits = (amount: number | string | { toString(): string }): string => String(Math.round(Number(amount.toString()) * 1_000_000));

export const deadlineIn = (days: number, now = Date.now()): string => String(BigInt(now) * 1_000_000n + BigInt(Math.max(1, Math.ceil(days))) * NS_PER_DAY);

export const chainJobId = (job: { onchainId: bigint | null; ref: string }): string => job.onchainId?.toString() ?? job.ref;

/** The contract reads job_id as a U64. A label like "J-21" means the job never made it on chain, and sending it only traps with 'unreachable'. */
export const assertChainJobId = (method: string, args: Record<string, unknown>): void => {
    const id = args.job_id;
    if (id !== undefined && id !== null && !/^\d{1,19}$/.test(String(id))) {
        throw new BadRequestException(`Job ${String(id)} is not on chain yet, so ${method} was not sent`);
    }
};

/** Free public NEAR RPCs tried after the ones in NEAR_RPC_URL / NEAR_RPC_URLS, so one rate-limited endpoint does not stop a call. */
const PUBLIC_RPCS: Record<'testnet' | 'mainnet', string[]> = {
    testnet: ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org', 'https://neart.lava.build', 'https://rpc.testnet.near.org'],
    mainnet: ['https://free.rpc.fastnear.com', 'https://near.drpc.org', 'https://near.lava.build', 'https://rpc.mainnet.near.org'],
};

/** RPC endpoints in the order they are tried: NEAR_RPC_URL, then NEAR_RPC_URLS (comma-separated, may hold an API key in the URL), then the public ones. */
export const rpcUrls = (env: NodeJS.ProcessEnv = process.env): string[] => {
    const net = (env['NEAR_NETWORK'] ?? 'testnet') === 'mainnet' ? 'mainnet' : 'testnet';
    const own = [env['NEAR_RPC_URL'] ?? '', ...(env['NEAR_RPC_URLS'] ?? '').split(',')].map((u) => u.trim()).filter(Boolean);
    return [...new Set([...own, ...PUBLIC_RPCS[net]])];
};

/** Rate limits (429), server errors, timeouts and network failures are worth another try on the next RPC. Contract errors are not. */
export const isRetryableRpcError = (e: unknown): boolean => {
    const err = (e ?? {}) as { cause?: unknown; type?: string; message?: string };
    if (typeof err.cause === 'number' && [408, 429, 500, 502, 503, 504].includes(err.cause)) return true;
    if (err.type === 'RetriesExceeded') return true;
    return /rate limit|too many requests|\b429\b|bad gateway|unavailable|fetch failed|failed to fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|Exceeded \d+ attempts/i.test(String(err.message ?? e));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One provider over several RPC URLs. A call that hits a retryable error moves to the next URL; after a full pass it
 * waits (1 s, 2 s, 4 s) and tries the list again. Re-sending a signed transaction is safe: it has the same hash and nonce.
 */
export function resilientProvider(urls: string[], onRetry?: (url: string, why: string) => void): JsonRpcProvider {
    const providers = urls.map((url) => new JsonRpcProvider({ url }, { retries: 2, wait: 300, backoff: 2 }));
    let current = 0;
    const run = async (call: (p: JsonRpcProvider) => Promise<unknown>): Promise<unknown> => {
        let last: unknown = new Error('No NEAR RPC configured');
        for (let round = 0; round < 3; round++) {
            for (let i = 0; i < providers.length; i++) {
                const p = providers[current]!;
                try {
                    return await call(p);
                } catch (e) {
                    if (!isRetryableRpcError(e)) throw e;
                    last = e;
                    onRetry?.(urls[current] ?? '', e instanceof Error ? e.message.slice(0, 120) : String(e));
                    current = (current + 1) % providers.length;
                }
            }
            if (round < 2) await sleep(1000 * 2 ** round);
        }
        throw last;
    };
    return new Proxy(providers[0]!, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => run((p) => (Reflect.get(p, prop) as (...a: unknown[]) => Promise<unknown>).apply(p, args));
        },
    });
}

export const chainBidId = (bid: { onchainId: bigint | null; id: string }): string => bid.onchainId?.toString() ?? bid.id;

export const chainIdOf = (value: unknown): bigint | null => {
    const v = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    return typeof v === 'string' && /^\d{1,19}$/.test(v) ? BigInt(v) : null;
};

export const decodeSuccessValue = (value: string | undefined | null): unknown => {
    if (!value) return null;
    const text = Buffer.from(value, 'base64').toString('utf8');
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

const findText = (node: unknown, keys: string[]): string | null => {
    if (typeof node === 'string') return null;
    if (!node || typeof node !== 'object') return null;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (keys.includes(k) && typeof v === 'string') return v;
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
        const found = findText(v, keys);
        if (found) return found;
    }
    return null;
};

export const panicMessage = (failure: unknown): string => {
    const raw = findText(failure, ['ExecutionError', 'error_message', 'message']) ?? JSON.stringify(failure ?? 'Unknown failure').slice(0, 300);
    return raw.replace(/^Smart contract panicked:\s*/, '');
};

const failureOf = (status: unknown): unknown => (status && typeof status === 'object' && 'Failure' in status ? (status as { Failure: unknown }).Failure : null);

export interface IndexResult {
    indexed: boolean;
    ok: boolean | null;
    method: string | null;
    reason: string | null;
}

export const functionCallOf = (res: unknown): { signer: string; receiverId: string; method: string; args: Record<string, unknown> } | null => {
    const t = (res as { transaction?: { signer_id?: unknown; receiver_id?: unknown; actions?: unknown } } | null)?.transaction;
    if (!t || typeof t.signer_id !== 'string' || typeof t.receiver_id !== 'string' || !Array.isArray(t.actions) || t.actions.length !== 1) return null;
    const fc = (t.actions[0] as { FunctionCall?: { method_name?: unknown; args?: unknown } } | null)?.FunctionCall;
    if (!fc || typeof fc.method_name !== 'string') return null;
    let args: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(Buffer.from(typeof fc.args === 'string' ? fc.args : '', 'base64').toString('utf8')) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
        args = {};
    }
    return { signer: t.signer_id, receiverId: t.receiver_id, method: fc.method_name, args };
};

export const parseOutcome = (outcome: {
    status: unknown;
    transaction_outcome?: { id: string };
    transaction?: { hash?: string };
    receipts_outcome?: { outcome: { status: unknown } }[];
}): TxOutcome => {
    const txHash = outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? '';
    const top = failureOf(outcome.status);
    if (top) return { txHash, ok: false, result: null, error: panicMessage(top) };
    const receipt = (outcome.receipts_outcome ?? []).map((r) => failureOf(r.outcome.status)).find((f) => f);
    if (receipt) return { txHash, ok: false, result: null, error: panicMessage(receipt) };
    const status = outcome.status as { SuccessValue?: string } | string;
    return { txHash, ok: true, result: typeof status === 'object' ? decodeSuccessValue(status.SuccessValue) : null, error: null };
};

@Injectable()
export class ChainService {
    private readonly mode = process.env['AGORA_CHAIN_MODE'] ?? 'mock';
    private readonly network = process.env['NEAR_NETWORK'] ?? 'testnet';
    private readonly contractId = process.env['AGORA_CONTRACT_ID'] || 'agora-market.agora-testnet.testnet';
    private counter = Math.floor(Date.now() / 1000);
    private provider: JsonRpcProvider | null = null;
    private readonly logger = new Logger(ChainService.name);
    private readonly accounts = new Map<string, Account>();
    private readonly provisioning = new Map<string, Promise<void>>();
    private readonly toppingUp = new Map<string, Promise<{ toppedUp: boolean; txHash: string | null }>>();

    constructor(
        private readonly indexer: IndexerService,
        private readonly chainRepository: ChainRepository,
    ) {}

    async callAs(role: ChainRole, accountId: string, method: string, args: Record<string, unknown>, deposit = '0'): Promise<ChainCallResult> {
        if (!accountId) {
            throw new BadRequestException(`No account to sign ${method} as ${role}`);
        }
        if (this.mode === 'real') {
            assertChainJobId(method, args);
            return this.callReal(role, accountId, method, args, deposit);
        }
        this.requireMock();
        this.counter += 1;
        const txHash = `mock-${method}-${this.counter}`;
        const result = mockIdMethods.includes(method) ? String(this.counter) : null;
        await this.indexer.onMockCall({ signer: accountId, method, args, txHash });
        return { tx_hash: txHash, explorer_url: this.explorerTxUrl(txHash), ok: true, result };
    }

    async buildUnsignedTx(signerId: string, method: string, args: Record<string, unknown>, deposit = '0'): Promise<UnsignedTx> {
        if (this.mode === 'real') assertChainJobId(method, args);
        const payload = JSON.stringify({ signer_id: signerId, receiver_id: this.contractId, method, args, deposit });
        return { unsigned_tx_base64: Buffer.from(payload).toString('base64') };
    }

    async view<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
        if (this.mode === 'real') {
            try {
                return (await this.rpc().callFunction({ contractId: this.contractId, method, args })) as T;
            } catch (e) {
                throw new BadRequestException(`Contract view ${method} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
            }
        }
        this.requireMock();
        const handler = mockViews[method];
        if (!handler) {
            throw new BadRequestException(`Unknown view method ${method}`);
        }
        return handler(args) as T;
    }

    async createAccount(profileId: string): Promise<CreatedAccount> {
        const name = `agora-${profileId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()}`;
        const created = { account_id: `${name}.${this.network}`, agents_account_id: `agents.${name}.${this.network}` };
        if (this.mode === 'real') {
            await this.provisionAccount(created.account_id);
            return created;
        }
        this.requireMock();
        return created;
    }

    /** True for the names createAccount hands out, so a profile from mock mode can be made real on first use. */
    isPlatformAccount(accountId: string): boolean {
        return new RegExp(`^(agents\\.)?agora-[0-9a-f]{8}\\.${this.network}$`).test(accountId);
    }

    /**
     * Real mode: makes a custodial account real on NEAR for a user who signed in without a wallet.
     *  1. The platform account creates <acct> with a full-access key that only the server holds (Vault near_key:<acct>).
     *  2. <acct> creates agents.<acct> with one function-call key limited to the marketplace's job methods
     *     (Vault near_key:agents.<acct>), the same shape a wallet user gets from "Enable agents".
     *  3. <acct> claims test USDC from the token faucet and deposits part of it, so the user can fund a job right away.
     * Every step checks the chain first, so a retry after a failure finishes the job instead of repeating it.
     */
    async provisionAccount(accountId: string): Promise<void> {
        const running = this.provisioning.get(accountId);
        if (running) return running;
        const job = this.runProvision(accountId).finally(() => this.provisioning.delete(accountId));
        this.provisioning.set(accountId, job);
        return job;
    }

    private async runProvision(accountId: string): Promise<void> {
        if (this.mode !== 'real') return;
        const platformId = process.env['AGORA_PLATFORM_ACCOUNT'];
        if (!platformId) throw new ServiceUnavailableException('Set AGORA_PLATFORM_ACCOUNT so the server can create NEAR accounts');
        const agentsId = `agents.${accountId}`;
        try {
            if (!(await this.accountExists(accountId))) {
                const key = await this.newVaultKey(accountId, `AGORA custodial full-access key for ${accountId}`);
                const platform = await this.account('platform', platformId);
                await platform.createAccount({ newAccountId: accountId, publicKey: KeyPair.fromString(key).getPublicKey(), nearToTransfer: nearToYocto(ACCOUNT_NEAR) });
                /* a top-level name goes through the network's registrar, which can refuse without failing the transaction */
                if (!(await this.accountExists(accountId))) throw new Error(`the network did not create ${accountId}`);
                this.logger.log(`Created ${accountId}`);
            }
            const owner = await this.account('owner', accountId);
            if (!(await this.accountExists(agentsId))) {
                const key = await this.newVaultKey(agentsId, `AGORA agents key for ${agentsId}, limited to ${this.contractId}`);
                await owner.signAndSendTransaction({
                    receiverId: agentsId,
                    actions: [
                        actions.createAccount(),
                        actions.transfer(nearToYocto(AGENTS_NEAR)),
                        actions.addFunctionCallAccessKey(KeyPair.fromString(key).getPublicKey(), this.contractId, AGENT_METHODS, nearToYocto(AGENTS_ALLOWANCE_NEAR)),
                    ],
                });
                this.logger.log(`Created ${agentsId}`);
            }
            await this.starterFunds(accountId, owner);
        } catch (e) {
            const why = e instanceof Error ? e.message : 'unknown error';
            this.logger.warn(`Setting up ${accountId} failed: ${why}`);
            throw new ServiceUnavailableException(`Could not set up your NEAR account ${accountId}: ${why}`);
        } finally {
            this.accounts.delete(`owner:${accountId}`);
            this.accounts.delete(`transaction_agent:${agentsId}`);
            this.accounts.delete(`owner:${agentsId}`);
        }
    }

    /** Claims the faucet's test USDC once and deposits most of it, unless the user already has AGORA balance. */
    private async starterFunds(accountId: string, owner: Account): Promise<void> {
        const usdc = process.env['AGORA_USDC_CONTRACT_ID'];
        if (!usdc) return;
        const inMarket = await this.rpc().callFunction({ contractId: this.contractId, method: 'get_balance', args: { account_id: accountId } }).catch(() => null) as { free?: string; escrowed?: string } | null;
        if (inMarket && (BigInt(inMarket.free ?? '0') > 0n || BigInt(inMarket.escrowed ?? '0') > 0n)) return;
        let wallet = BigInt(String(await this.rpc().callFunction({ contractId: usdc, method: 'ft_balance_of', args: { account_id: accountId } }).catch(() => '0') ?? '0'));
        if (wallet === 0n) {
            await owner.signAndSendTransaction({ receiverId: usdc, actions: [actions.functionCall('faucet', {}, teraToGas(30), 0n)] });
            wallet = BigInt(String(await this.rpc().callFunction({ contractId: usdc, method: 'ft_balance_of', args: { account_id: accountId } }).catch(() => '0') ?? '0'));
        }
        const amount = wallet < STARTER_DEPOSIT_UNITS ? wallet : STARTER_DEPOSIT_UNITS;
        if (amount === 0n) return;
        await this.callAs('owner', accountId, 'ft_transfer_call', { receiver_id: this.contractId, amount: amount.toString(), msg: 'deposit' }, '1');
    }

    /**
     * Whether the server can sign for agents.<owner>: Vault holds its key and that key is on the account on chain.
     * Mock mode is always ready.
     */
    async agentsStatus(agentsId: string): Promise<{ ready: boolean; exists: boolean; publicKey: string | null }> {
        if (this.mode !== 'real') return { ready: true, exists: true, publicKey: null };
        const key = await this.chainRepository.getVaultSecret(vaultKeyName(agentsId));
        const publicKey = key && /^(ed25519|secp256k1):/.test(key) ? KeyPair.fromString(key as KeyPairString).getPublicKey().toString() : null;
        const exists = await this.accountExists(agentsId).catch(() => false);
        if (!exists || !publicKey) return { ready: false, exists, publicKey };
        const onChain = await this.rpc().viewAccessKey({ accountId: agentsId, publicKey }).then(() => true).catch(() => false);
        return { ready: onChain, exists, publicKey };
    }

    /**
     * A brand-new wallet has no NEAR, so it cannot pay for "Enable agents". The platform sends it a small one-time
     * gift first: at most once per account ever, and at most GAS_TOPUP_DAILY_CAP a day, recorded in chain_txs.
     * Returns whether NEAR was sent. Mock mode and wallets that already have enough NEAR get nothing.
     */
    async gasTopUp(accountId: string): Promise<{ toppedUp: boolean; txHash: string | null }> {
        if (this.mode !== 'real') return { toppedUp: false, txHash: null };
        const running = this.toppingUp.get(accountId);
        if (running) return running;
        const job = this.runGasTopUp(accountId).finally(() => this.toppingUp.delete(accountId));
        this.toppingUp.set(accountId, job);
        return job;
    }

    private async runGasTopUp(accountId: string): Promise<{ toppedUp: boolean; txHash: string | null }> {
        const view = await this.rpc().viewAccount({ accountId }).catch(() => null) as { amount?: bigint | string } | null;
        if (!view) throw new BadRequestException(`${accountId} does not exist on NEAR ${this.network}`);
        if (BigInt(view.amount ?? 0) >= nearToYocto(GAS_TOPUP_MIN_NEAR)) return { toppedUp: false, txHash: null };
        const enough = `Your wallet needs about ${GAS_TOPUP_MIN_NEAR} NEAR to set up agents`;
        if (await this.chainRepository.hasGasTopUp(accountId)) throw new BadRequestException(`${enough}. AGORA already covered this wallet once, so add NEAR from a faucet or another wallet`);
        const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
        if ((await this.chainRepository.countGasTopUpsSince(dayStart)) >= GAS_TOPUP_DAILY_CAP) {
            throw new ServiceUnavailableException(`${enough}. AGORA's free setup gas is used up for today, so add NEAR from a faucet or another wallet`);
        }
        const platformId = process.env['AGORA_PLATFORM_ACCOUNT'];
        if (!platformId) throw new ServiceUnavailableException(`${enough}. AGORA cannot cover it right now (no platform account set)`);
        const platform = await this.account('platform', platformId);
        let outcome: TxOutcome;
        try {
            const res = await platform.signAndSendTransaction({ receiverId: accountId, actions: [actions.transfer(nearToYocto(GAS_TOPUP_NEAR))], throwOnFailure: false });
            outcome = parseOutcome(res as unknown as Parameters<typeof parseOutcome>[0]);
        } catch (e) {
            throw new ServiceUnavailableException(`${enough}. AGORA could not send it: ${e instanceof Error ? e.message : 'unknown error'}`);
        }
        await this.record(platformId, GAS_TOPUP, { account_id: accountId, amount_near: GAS_TOPUP_NEAR }, outcome);
        if (!outcome.ok) throw new ServiceUnavailableException(`${enough}. AGORA could not send it: ${outcome.error}`);
        this.logger.log(`Sent ${GAS_TOPUP_NEAR} NEAR setup gas to ${accountId}`);
        return { toppedUp: true, txHash: outcome.txHash };
    }

    /** The public half of the key the server keeps for agents.<owner>, made and saved in Vault on first ask. */
    async agentsPublicKey(agentsId: string): Promise<string> {
        const key = await this.newVaultKey(agentsId, `AGORA agents key for ${agentsId}, limited to ${this.contractId}`);
        this.accounts.delete(`transaction_agent:${agentsId}`);
        this.accounts.delete(`owner:${agentsId}`);
        return KeyPair.fromString(key).getPublicKey().toString();
    }

    private async accountExists(accountId: string): Promise<boolean> {
        try {
            await this.rpc().viewAccount({ accountId });
            return true;
        } catch (e) {
            if (/does not exist|UNKNOWN_ACCOUNT|doesn't exist/i.test(e instanceof Error ? e.message : String(e))) return false;
            throw e;
        }
    }

    /** The key for an account that is about to be created: the one already in Vault, or a new one saved there first. */
    private async newVaultKey(accountId: string, description: string): Promise<KeyPairString> {
        const key = await this.chainRepository.putVaultSecret(vaultKeyName(accountId), KeyPairEd25519.fromRandom().toString(), description);
        return key as KeyPairString;
    }

    networkId(): string {
        return this.network;
    }

    walletChainInfo(): { mode: string; network: string; contract: string; usdc: string | null } {
        return { mode: this.mode, network: this.network, contract: this.contractId, usdc: process.env['AGORA_USDC_CONTRACT_ID'] || null };
    }

    async verifyWalletSignature(p: { accountId: string; publicKey: string; signature: Uint8Array; message: string; nonce: Uint8Array; recipient: string; callbackUrl?: string }): Promise<void> {
        const attempt = (callbackUrl?: string) => verifyMessage({
            signerAccountId: p.accountId,
            signerPublicKey: p.publicKey,
            signature: p.signature,
            payload: { message: p.message, nonce: p.nonce, recipient: p.recipient, ...(callbackUrl ? { callbackUrl } : {}) },
            provider: this.rpc(),
        });
        try {
            await attempt();
        } catch (first) {
            const why = first instanceof Error ? first.message : 'unknown error';
            if (!p.callbackUrl || !/Signature verification failed/.test(why)) {
                throw new BadRequestException(/FullAccess/.test(why) ? 'That key is not a full-access key of this account' : `Could not verify the wallet signature: ${why}`);
            }
            await attempt(p.callbackUrl).catch(() => { throw new BadRequestException('The wallet signature does not match'); });
        }
    }

    isMock(): boolean {
        return this.mode === 'mock';
    }

    explorerTxUrl(txHash: string): string {
        return `${this.explorerBase()}/txns/${txHash}`;
    }

    explorerAccountUrl(accountId: string): string {
        return `${this.explorerBase()}/address/${accountId}`;
    }

    receiverFor(method: string): string {
        if (method !== 'ft_transfer_call') return this.contractId;
        const usdc = process.env['AGORA_USDC_CONTRACT_ID'];
        if (!usdc) throw new ServiceUnavailableException('Set AGORA_USDC_CONTRACT_ID to send USDC');
        return usdc;
    }

    async signingKey(role: ChainRole, accountId: string): Promise<KeyPairString> {
        const envName = ROLE_KEY_ENV[role];
        let key = (envName ? process.env[envName] : undefined) || (await this.chainRepository.getVaultSecret(vaultKeyName(accountId)));
        if (!key && this.mode === 'real' && this.isPlatformAccount(accountId) && !this.provisioning.has(ownerOf(accountId))) {
            /* a profile from mock mode carries an agora-xxxxxxxx name that was never created; create it now */
            await this.provisionAccount(ownerOf(accountId));
            key = await this.chainRepository.getVaultSecret(vaultKeyName(accountId));
        }
        if (!key && accountId.startsWith('agents.')) {
            throw new BadRequestException(`${accountId} is not set up yet. Open Wallet and click "Enable agents" (one signature in your NEAR wallet), then try again`);
        }
        if (!key) throw new BadRequestException(`No signing key for ${accountId}`);
        if (!/^(ed25519|secp256k1):/.test(key)) throw new BadRequestException(`The signing key for ${accountId} is not a NEAR key`);
        return key as KeyPairString;
    }

    private async callReal(role: ChainRole, accountId: string, method: string, args: Record<string, unknown>, deposit: string): Promise<ChainCallResult> {
        if (!process.env['AGORA_CONTRACT_ID']) throw new ServiceUnavailableException('Set AGORA_CONTRACT_ID before using real chain mode');
        const receiverId = this.receiverFor(method);
        const account = await this.account(role, accountId);
        let outcome: TxOutcome;
        try {
            const res = await account.signAndSendTransaction({
                receiverId,
                actions: [actions.functionCall(method, args, gasFor(method), BigInt(deposit || '0'))],
                throwOnFailure: false,
            });
            outcome = parseOutcome(res as unknown as Parameters<typeof parseOutcome>[0]);
        } catch (e) {
            throw new BadRequestException(`Could not send ${method}: ${e instanceof Error ? e.message : 'unknown error'}`);
        }
        await this.record(accountId, method, args, outcome);
        if (!outcome.ok) throw new BadRequestException(`Contract refused ${method}: ${outcome.error}`);
        await this.applyConfirmed({ signer: accountId, method, args, txHash: outcome.txHash });
        return { tx_hash: outcome.txHash, explorer_url: this.explorerTxUrl(outcome.txHash), ok: true, result: outcome.result };
    }

    async indexTx(txHash: string, signerId: string): Promise<IndexResult> {
        if (this.mode !== 'real') return { indexed: false, ok: null, method: null, reason: 'Chain mode is mock, so the mock already applied this call' };
        if (await this.indexer.hasTx(txHash)) return { indexed: false, ok: null, method: null, reason: 'Already indexed' };
        let res: unknown;
        try {
            res = await this.rpc().viewTransactionStatus({ txHash, accountId: signerId, waitUntil: 'FINAL' });
        } catch (e) {
            throw new BadRequestException(`Could not read ${txHash}: ${e instanceof Error ? e.message : 'unknown error'}`);
        }
        const call = functionCallOf(res);
        if (!call) return { indexed: false, ok: null, method: null, reason: 'Not a single function call' };
        if (call.receiverId !== this.contractId && call.method !== 'ft_transfer_call') return { indexed: false, ok: null, method: call.method, reason: 'Not a call to the AGORA contract' };
        const outcome = { ...parseOutcome(res as Parameters<typeof parseOutcome>[0]), txHash };
        await this.record(call.signer, call.method, call.args, outcome);
        if (outcome.ok) await this.applyConfirmed({ signer: call.signer, method: call.method, args: call.args, txHash });
        return { indexed: true, ok: outcome.ok, method: call.method, reason: outcome.error };
    }

    private async applyConfirmed(call: MockCall): Promise<void> {
        try {
            await this.indexer.applyCall(call);
        } catch (e) {
            this.logger.error(`Indexing ${call.method} ${call.txHash} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
        }
        const accounts = new Set<string>([ownerOf(call.signer)]);
        const jobKey = jobKeyOf(call);
        if (jobKey) (await this.indexer.partiesOf(jobKey)).forEach((a) => accounts.add(a));
        for (const accountId of accounts) await this.refreshBalance(accountId);
    }

    async liveBalance(accountId: string): Promise<{ available: number; escrowed: number } | null> {
        if (this.mode !== 'real') return null;
        try {
            const b = await this.view<{ free: string; escrowed: string }>('get_balance', { account_id: accountId });
            const available = usdcOf(b.free);
            const escrowed = usdcOf(b.escrowed);
            this.indexer.syncBalance(accountId, available, escrowed).catch((e: unknown) => {
                this.logger.warn(`Balance save for ${accountId} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
            });
            return { available, escrowed };
        } catch (e) {
            this.logger.warn(`Balance read for ${accountId} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
            return null;
        }
    }

    async refreshBalance(accountId: string): Promise<boolean> {
        if (this.mode !== 'real') return false;
        try {
            const b = await this.view<{ free: string; escrowed: string }>('get_balance', { account_id: accountId });
            await this.indexer.syncBalance(accountId, usdcOf(b.free), usdcOf(b.escrowed));
            return true;
        } catch (e) {
            this.logger.warn(`Balance sync for ${accountId} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
            return false;
        }
    }

    private async record(signer: string, method: string, args: Record<string, unknown>, outcome: TxOutcome): Promise<void> {
        if (!outcome.txHash) return;
        const jobKey = jobRefOf(method === 'ft_transfer_call' ? bondJobOf(args['msg']) : args['job_id']);
        try {
            await this.indexer.recordRealCall({ txHash: outcome.txHash, signer, method, args, ok: outcome.ok, error: outcome.error, jobKey });
        } catch {
            return;
        }
    }

    private async account(role: ChainRole, accountId: string): Promise<Account> {
        const cacheKey = `${role}:${accountId}`;
        const cached = this.accounts.get(cacheKey);
        if (cached) return cached;
        const key = await this.signingKey(role, accountId);
        const account = new Account(accountId, this.rpc(), KeyPairSigner.fromSecretKey(key));
        this.accounts.set(cacheKey, account);
        return account;
    }

    private rpc(): JsonRpcProvider {
        if (!this.provider) {
            /* the host only, never the path or query, which can hold an API key */
            this.provider = resilientProvider(rpcUrls(), (url, why) => this.logger.warn(`NEAR RPC ${url.replace(/^(https?:\/\/[^/?]+).*/, '$1')} failed (${why}), trying the next one`));
        }
        return this.provider;
    }

    private explorerBase(): string {
        return this.network === 'mainnet' ? 'https://nearblocks.io' : `https://${this.network}.nearblocks.io`;
    }

    private requireMock(): void {
        if (this.mode !== 'mock') {
            throw new ServiceUnavailableException('AGORA_CHAIN_MODE must be mock or real');
        }
    }
}
