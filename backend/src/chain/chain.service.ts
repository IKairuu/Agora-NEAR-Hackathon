import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Account, actions, JsonRpcProvider, KeyPairSigner, KeyPairString, teraToGas } from 'near-api-js';
import { verifyMessage } from 'near-api-js/nep413';
import { IndexerService, jobKeyOf, jobRefOf, bondJobOf, MockCall, ownerOf, usdcOf } from '../indexer/indexer.service.js';
import { ChainRepository } from './chain.repository.js';
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

export const vaultKeyName = (accountId: string): string => `near_key:${accountId}`;

export const gasFor = (method: string): bigint => teraToGas(HEAVY_METHODS.includes(method) ? HEAVY_TGAS : DEFAULT_TGAS);

export const usdcUnits = (amount: number | string | { toString(): string }): string => String(Math.round(Number(amount.toString()) * 1_000_000));

export const deadlineIn = (days: number, now = Date.now()): string => String(BigInt(now) * 1_000_000n + BigInt(Math.max(1, Math.ceil(days))) * NS_PER_DAY);

export const chainJobId = (job: { onchainId: bigint | null; ref: string }): string => job.onchainId?.toString() ?? job.ref;

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
    private readonly rpcUrl = process.env['NEAR_RPC_URL'] || `https://rpc.${process.env['NEAR_NETWORK'] ?? 'testnet'}.near.org`;
    private counter = Math.floor(Date.now() / 1000);
    private provider: JsonRpcProvider | null = null;
    private readonly logger = new Logger(ChainService.name);
    private readonly accounts = new Map<string, Account>();

    constructor(
        private readonly indexer: IndexerService,
        private readonly chainRepository: ChainRepository,
    ) {}

    async callAs(role: ChainRole, accountId: string, method: string, args: Record<string, unknown>, deposit = '0'): Promise<ChainCallResult> {
        if (!accountId) {
            throw new BadRequestException(`No account to sign ${method} as ${role}`);
        }
        if (this.mode === 'real') return this.callReal(role, accountId, method, args, deposit);
        this.requireMock();
        this.counter += 1;
        const txHash = `mock-${method}-${this.counter}`;
        const result = mockIdMethods.includes(method) ? String(this.counter) : null;
        await this.indexer.onMockCall({ signer: accountId, method, args, txHash });
        return { tx_hash: txHash, explorer_url: this.explorerTxUrl(txHash), ok: true, result };
    }

    async buildUnsignedTx(signerId: string, method: string, args: Record<string, unknown>, deposit = '0'): Promise<UnsignedTx> {
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
        if (this.mode === 'real') {
            throw new ServiceUnavailableException('Creating NEAR accounts in real chain mode is not built yet. Create the account, save its key in Supabase Vault as near_key:<account> and set it on the profile');
        }
        this.requireMock();
        const name = `agora-${profileId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()}`;
        return {
            account_id: `${name}.${this.network}`,
            agents_account_id: `agents.${name}.${this.network}`,
        };
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
        const key = (envName ? process.env[envName] : undefined) || (await this.chainRepository.getVaultSecret(vaultKeyName(accountId)));
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
        if (!this.provider) this.provider = new JsonRpcProvider({ url: this.rpcUrl });
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
