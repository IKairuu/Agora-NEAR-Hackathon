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
export async function proveOwnership(userId: string): Promise<OwnershipProof> {
  const { selector } = await load();
  const wallet = await selector.wallet();
  const accountId = await connectedAccount();
  if (!accountId) throw new Error('Connect a wallet first');
  const message = `Link NEAR account ${accountId} to AGORA user ${userId}. Issued at ${new Date().toISOString()}`;
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
