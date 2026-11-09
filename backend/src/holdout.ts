import { InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, KeyObject, randomBytes } from 'node:crypto';

export const HOLDOUT_VERSION = 1;
export const HOLDOUT_ALG = 'X25519-HKDF-SHA256-A256GCM';

export interface HoldoutFile {
    path: string;
    content: string;
}

export interface HoldoutPlain {
    command: string | null;
    files: HoldoutFile[];
}

export interface SealedHoldout {
    holdoutHash: string;
    keyId: string;
    ciphertext: Buffer;
}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export const holdoutHashOf = (plain: HoldoutPlain): string =>
    sha256(JSON.stringify({
        standard: 'agora-holdout',
        version: HOLDOUT_VERSION,
        command: plain.command ?? null,
        files: plain.files.map((f) => ({ path: f.path, sha256: sha256(f.content) })).sort(byPath),
    }));

const spkiOf = (key: KeyObject): Buffer => key.export({ format: 'der', type: 'spki' });

const runnerKey = (): KeyObject => {
    const raw = (process.env['AGORA_HOLDOUT_PUBLIC_KEY'] ?? '').trim();
    if (!raw) throw new InternalServerErrorException('Hidden tests are not configured on the server');
    try {
        const key = createPublicKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'spki' });
        if (key.asymmetricKeyType === 'x25519') return key;
    } catch {
        void 0;
    }
    throw new InternalServerErrorException('Hidden tests are not configured on the server');
};

export const sealHoldout = (input: HoldoutPlain): SealedHoldout => {
    const plain: HoldoutPlain = { command: input.command ?? null, files: input.files.map((f) => ({ path: f.path, content: f.content })) };
    const recipient = runnerKey();
    const keyId = sha256(spkiOf(recipient)).slice(0, 16);
    const holdoutHash = holdoutHashOf(plain);
    const eph = generateKeyPairSync('x25519');
    const epk = spkiOf(eph.publicKey);
    const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
    const key = Buffer.from(hkdfSync('sha256', shared, epk, `agora-holdout:v${HOLDOUT_VERSION}:${keyId}`, 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${HOLDOUT_ALG}|v${HOLDOUT_VERSION}|${keyId}|${holdoutHash}`));
    const ct = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
    const blob = JSON.stringify({
        v: HOLDOUT_VERSION,
        alg: HOLDOUT_ALG,
        kid: keyId,
        epk: epk.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ct: ct.toString('base64'),
    });
    return { holdoutHash, keyId, ciphertext: Buffer.from(blob, 'utf8') };
};

export const ciphertextHashOf = (ciphertext: Uint8Array): string => sha256(Buffer.from(ciphertext));

export const holdoutRunOf = (spec: { holdoutHash: string | null; holdout?: { holdoutHash: string; ciphertext: Uint8Array } | null }): { holdoutRef?: string; holdoutBlob?: string } => {
    const ref = spec.holdoutHash ?? spec.holdout?.holdoutHash ?? null;
    if (!ref) return {};
    return spec.holdout ? { holdoutRef: ref, holdoutBlob: Buffer.from(spec.holdout.ciphertext).toString('utf8') } : { holdoutRef: ref };
};
