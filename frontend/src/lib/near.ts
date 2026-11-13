/**
 * The user's own NEAR wallet, through NEAR Wallet Selector (MyNearWallet, Meteor, HERE).
 * Nothing here needs an API key: the wallets run in their own window or extension and talk to the public RPC.
 * The library is loaded only when someone opens the wallet picker, so the rest of the app stays small.
 */
import { Buffer } from 'buffer';
import type { WalletSelector } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';

/* the wallet modules were written for Node: they expect `global`, `Buffer` and `process` to exist in the browser too */
const g = globalThis as { Buffer?: typeof Buffer; global?: typeof globalThis; process?: { env: Record<string, string | undefined> } };
g.global ??= globalThis;
g.Buffer ??= Buffer;
g.process ??= { env: {} };

export const NEAR_NETWORK: 'testnet' | 'mainnet' = import.meta.env.VITE_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
/** Who the signed message is for. The backend checks the same value. */
const RECIPIENT = 'agora';

let loading: Promise<{ selector: WalletSelector; modal: WalletSelectorModal }> | null = null;

function load() {
  loading ??= (async () => {
    const [{ setupWalletSelector }, { setupModal }, { setupMyNearWallet }, { setupMeteorWallet }, { setupHereWallet }] = await Promise.all([
      import('@near-wallet-selector/core'),
      import('@near-wallet-selector/modal-ui'),
      import('@near-wallet-selector/my-near-wallet'),
      import('@near-wallet-selector/meteor-wallet'),
      import('@near-wallet-selector/here-wallet'),
      import('@near-wallet-selector/modal-ui/styles.css'),
    ]);
    const selector = await setupWalletSelector({ network: NEAR_NETWORK, modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()] });
    const modal = setupModal(selector, { theme: 'auto', description: 'Connect the NEAR wallet you want to fund jobs from and get paid to.' });
    return { selector, modal };
  })().catch((e: unknown) => { loading = null; throw e; });
  return loading;
}

/** The account the wallet is signed in with on this browser, if any. */
export async function connectedAccount(): Promise<string | null> {
  const { selector } = await load();
  return selector.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
}

/** Opens the wallet picker. Resolves with the account once a wallet signs in, or null if the picker is closed. */
export async function pickWallet(): Promise<string | null> {
  const { selector, modal } = await load();
  return new Promise((resolve) => {
    const signedIn = selector.on('signedIn', ({ accounts }) => { done(accounts[0]?.accountId ?? null); modal.hide(); });
    const hidden = modal.on('onHide', () => { void connectedAccount().then(done); });
    let settled = false;
    function done(acct: string | null) {
      if (settled) return;
      settled = true; signedIn.remove(); hidden.remove(); resolve(acct);
    }
    modal.show();
  });
}

export interface OwnershipProof { account_id: string; public_key: string; signature: string; message: string; nonce: string; callback_url: string }

/**
 * Asks the wallet to sign a short NEP-413 message naming this AGORA user. It is not a transaction and costs nothing.
 * The backend checks the signature and that the key is a full-access key of the account.
 * Call it straight from a click: some wallets open a popup, and browsers block popups that don't come from a click.
 */
export function proveOwnership(userId: string): Promise<OwnershipProof> {
  return signForAgora((accountId) => `Link NEAR account ${accountId} to AGORA user ${userId}. Issued at ${new Date().toISOString()}`);
}

/** Same check, used to sign in with the wallet alone. The backend accepts it for 5 minutes. */
export function proveSignIn(): Promise<OwnershipProof> {
  return signForAgora((accountId) => `Sign in to AGORA as ${accountId}. Issued at ${new Date().toISOString()}`);
}

async function signForAgora(text: (accountId: string) => string): Promise<OwnershipProof> {
  const { selector } = await load();
  const wallet = await selector.wallet();
  const accountId = await connectedAccount();
  if (!accountId) throw new Error('Connect a wallet first');
  const message = text(accountId);
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
  const callbackUrl = window.location.origin + window.location.pathname;
  const signed = await wallet.signMessage({ message, recipient: RECIPIENT, nonce, callbackUrl });
  if (!signed) throw new Error('The wallet did not return a signature');
  if (signed.accountId && signed.accountId !== accountId) throw new Error(`The wallet signed as ${signed.accountId}, not ${accountId}`);
  return { account_id: accountId, public_key: signed.publicKey, signature: signed.signature, message, nonce: nonce.toString('base64'), callback_url: callbackUrl };
}

/** Signs the wallet out of this browser. The account stays linked to the AGORA profile. */
export async function disconnectWallet(): Promise<void> {
  const { selector } = await load();
  const wallet = await selector.wallet().catch(() => null);
  await wallet?.signOut();
}

/* ---------------- money moved by the user's own wallet ---------------- */

const TGAS = 10n ** 12n;
const ONE_YOCTO = 1n;
/** What the USDC contract asks to register a new holder (refunded when the account is already registered). */
const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n;

export interface WalletCall { method: string; args: Record<string, unknown>; tgas: number; deposit: bigint }

/** USDC has 6 decimals: 12.5 becomes "12500000". */
export const usdcUnits = (amount: number): string => String(Math.round(amount * 1_000_000));

/**
 * Asks the connected wallet to sign one transaction and waits for the result. Returns the transaction hash.
 * Throws when the wallet is not the linked AGORA account, so money never moves from the wrong account.
 */
export async function walletSend(expectAccount: string, receiverId: string, calls: WalletCall[]): Promise<string> {
  const { selector } = await load();
  const signer = await connectedAccount();
  if (!signer) throw new Error('Connect your NEAR wallet first');
  if (expectAccount && signer !== expectAccount) throw new Error(`Your wallet is signed in as ${signer}, but this AGORA account is linked to ${expectAccount}. Switch accounts in the wallet or link ${signer}`);
  const [{ actionCreators }, wallet] = await Promise.all([import('@near-js/transactions'), selector.wallet()]);
  const actions = calls.map((c) => actionCreators.functionCall(c.method, c.args, BigInt(c.tgas) * TGAS, c.deposit));
  const outcome = await wallet.signAndSendTransaction({ signerId: signer, receiverId, actions });
  const hash = outcome ? (outcome.transaction_outcome?.id ?? (outcome.transaction as { hash?: string } | undefined)?.hash) : undefined;
  if (!hash) throw new Error('The wallet did not return a transaction');
  const failure = outcome && typeof outcome.status === 'object' && 'Failure' in outcome.status ? outcome.status.Failure : null;
  if (failure) throw new Error(`NEAR refused the transaction: ${JSON.stringify(failure).slice(0, 200)}`);
  return hash;
}

/** ft_transfer_call into the marketplace contract: USDC leaves the wallet and becomes AGORA balance. */
export const depositCall = (contract: string, amount: number): WalletCall =>
  ({ method: 'ft_transfer_call', args: { receiver_id: contract, amount: usdcUnits(amount), msg: 'deposit' }, tgas: 100, deposit: ONE_YOCTO });

/** The contract's withdraw: free AGORA balance goes back to the wallet as USDC. */
export const withdrawCall = (amount: number): WalletCall =>
  ({ method: 'withdraw', args: { amount: usdcUnits(amount) }, tgas: 60, deposit: ONE_YOCTO });

/** The contract's set_mandate, with the arguments the backend already checked (POST /mandates/v1/check). Owner only, 1 yocto. */
export const mandateCall = (args: Record<string, unknown>): WalletCall =>
  ({ method: 'set_mandate', args, tgas: 30, deposit: ONE_YOCTO });

/** pause needs no deposit; unpause is owner only and needs 1 yocto. */
export const pauseCall = (): WalletCall => ({ method: 'pause', args: {}, tgas: 30, deposit: 0n });
export const unpauseCall = (): WalletCall => ({ method: 'unpause', args: {}, tgas: 30, deposit: ONE_YOCTO });

/** Plain USDC transfer from the wallet. Registers the receiver with the token first, as NEP-141 requires. */
export const sendCalls = (to: string, amount: number): WalletCall[] => [
  { method: 'storage_deposit', args: { account_id: to, registration_only: true }, tgas: 10, deposit: STORAGE_DEPOSIT },
  { method: 'ft_transfer', args: { receiver_id: to, amount: usdcUnits(amount), memo: 'Sent from AGORA' }, tgas: 30, deposit: ONE_YOCTO },
];

/** A public RPC (FastNEAR; rpc.<network>.near.org is deprecated and rate-limited). Reading balances does not need the wallet library. */
const RPC_URL = (import.meta.env.VITE_NEAR_RPC_URL as string | undefined) || (NEAR_NETWORK === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');

async function rpcQuery<T>(params: Record<string, unknown>): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'agora', method: 'query', params: { finality: 'optimistic', ...params } }),
  });
  const data = (await res.json()) as { result?: T & { error?: string }; error?: { message?: string } };
  if (!data.result || data.result.error) throw new Error(data.error?.message ?? data.result?.error ?? 'RPC error');
  return data.result;
}

/** One access key on a NEAR account, as the chain reports it. */
export interface AccessKeyRow { account: string; publicKey: string; full: boolean; receiver: string | null; methods: string[]; allowance: number | null }

/** The account's real access keys (view_access_key_list). Null if the account does not exist on chain. Throws if the RPC fails. */
export async function accessKeys(accountId: string): Promise<AccessKeyRow[] | null> {
  type Perm = 'FullAccess' | { FunctionCall: { receiver_id: string; method_names: string[]; allowance: string | null } };
  try {
    const r = await rpcQuery<{ keys: { public_key: string; access_key: { permission: Perm } }[] }>({ request_type: 'view_access_key_list', account_id: accountId });
    return r.keys.map((k) => {
      const p = k.access_key.permission;
      if (p === 'FullAccess') return { account: accountId, publicKey: k.public_key, full: true, receiver: null, methods: [], allowance: null };
      const fc = p.FunctionCall;
      return { account: accountId, publicKey: k.public_key, full: false, receiver: fc.receiver_id, methods: fc.method_names, allowance: fc.allowance === null ? null : Number(BigInt(fc.allowance) / 10n ** 20n) / 10_000 };
    });
  } catch (e) {
    if (e instanceof Error && /does not exist|UNKNOWN_ACCOUNT/i.test(e.message)) return null;
    throw e;
  }
}

/** What the account holds in its own wallet, read from the chain: USDC (null if no token is set) and NEAR. Throws if the RPC fails. */
export async function walletBalances(accountId: string, usdc: string | null): Promise<{ usdc: number | null; near: number }> {
  const near = rpcQuery<{ amount: string }>({ request_type: 'view_account', account_id: accountId })
    .then((r) => Number(BigInt(r.amount) / 10n ** 18n) / 1_000_000);
  const token = usdc
    ? rpcQuery<{ result: number[] }>({ request_type: 'call_function', account_id: usdc, method_name: 'ft_balance_of', args_base64: btoa(JSON.stringify({ account_id: accountId })) })
      .then((r) => Number(JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))) as string) / 1_000_000)
    : Promise.resolve(null);
  const [n, u] = await Promise.all([near, token]);
  return { usdc: u, near: n };
}
