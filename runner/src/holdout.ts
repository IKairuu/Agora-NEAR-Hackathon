import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createPrivateKey,
    createPublicKey,
    diffieHellman,
    generateKeyPairSync,
    hkdfSync,
    KeyObject,
    randomBytes,
} from 'node:crypto';

export const HOLDOUT_VERSION = 1;
export const HOLDOUT_ALG = 'X25519-HKDF-SHA256-A256GCM';

const MAX_FILES = 50;
const MAX_CONTENT = 200_000;
const MAX_COMMAND = 1000;
const PATH_RE = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[\w./-]{1,300}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

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
    blob: string;
}

export class HoldoutError extends Error {}

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

export const keyIdOf = (publicKey: KeyObject): string => sha256(spkiOf(publicKey)).slice(0, 16);

const readKey = (raw: string, kind: 'public' | 'private'): KeyObject => {
    let key: KeyObject;
    try {
        const der = Buffer.from(raw.trim(), 'base64');
        key = kind === 'public' ? createPublicKey({ key: der, format: 'der', type: 'spki' }) : createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    } catch {
        throw new HoldoutError(`Holdout ${kind} key is not valid`);
    }
    if (key.asymmetricKeyType !== 'x25519') throw new HoldoutError(`Holdout ${kind} key must be an X25519 key`);
    return key;
};

const aadOf = (keyId: string, holdoutHash: string): Buffer => Buffer.from(`${HOLDOUT_ALG}|v${HOLDOUT_VERSION}|${keyId}|${holdoutHash}`);

const contentKey = (shared: Buffer, epk: Buffer, keyId: string): Buffer =>
    Buffer.from(hkdfSync('sha256', shared, epk, `agora-holdout:v${HOLDOUT_VERSION}:${keyId}`, 32));

export const checkHoldout = (plain: HoldoutPlain): HoldoutPlain => {
    if (!plain || !Array.isArray(plain.files) || plain.files.length === 0 || plain.files.length > MAX_FILES) throw new HoldoutError('Holdout must have 1 to 50 files');
    if (plain.command !== null && (typeof plain.command !== 'string' || plain.command.length === 0 || plain.command.length > MAX_COMMAND)) throw new HoldoutError('Holdout command is not valid');
    const seen = new Set<string>();
    for (const f of plain.files) {
        if (typeof f?.path !== 'string' || !PATH_RE.test(f.path)) throw new HoldoutError('Holdout file path is not valid');
        if (typeof f.content !== 'string' || f.content.length > MAX_CONTENT) throw new HoldoutError('Holdout file content is not valid');
        if (seen.has(f.path)) throw new HoldoutError('Holdout file paths must be unique');
        seen.add(f.path);
    }
    return { command: plain.command, files: plain.files.map((f) => ({ path: f.path, content: f.content })) };
};

export const sealHoldout = (publicKeyB64: string, input: HoldoutPlain): SealedHoldout => {
    const plain = checkHoldout(input);
    const recipient = readKey(publicKeyB64, 'public');
    const keyId = keyIdOf(recipient);
    const holdoutHash = holdoutHashOf(plain);
    const eph = generateKeyPairSync('x25519');
    const epk = spkiOf(eph.publicKey);
    const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', contentKey(shared, epk, keyId), iv);
    cipher.setAAD(aadOf(keyId, holdoutHash));
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
    return { holdoutHash, keyId, blob };
};

export const openHoldout = (privateKeyB64: string, blob: string, holdoutHash: string): HoldoutPlain => {
    if (!HASH_RE.test(holdoutHash)) throw new HoldoutError('Holdout hash is not valid');
    let env: Record<string, unknown>;
    try {
        env = JSON.parse(blob) as Record<string, unknown>;
    } catch {
        throw new HoldoutError('Holdout blob is malformed');
    }
    if (env['v'] !== HOLDOUT_VERSION || env['alg'] !== HOLDOUT_ALG) throw new HoldoutError('Holdout blob version is not supported');
    const field = (name: string): Buffer => {
        const value = env[name];
        if (typeof value !== 'string' || value.length === 0) throw new HoldoutError('Holdout blob is malformed');
        return Buffer.from(value, 'base64');
    };
    const privateKey = readKey(privateKeyB64, 'private');
    const keyId = keyIdOf(createPublicKey(privateKey));
    if (env['kid'] !== keyId) throw new HoldoutError('Holdout was sealed for another runner key');
    const epk = field('epk');
    const iv = field('iv');
    const tag = field('tag');
    const ct = field('ct');
    if (iv.length !== 12 || tag.length !== 16) throw new HoldoutError('Holdout blob is malformed');
    let text: string;
    try {
        const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: epk, format: 'der', type: 'spki' }) });
        const decipher = createDecipheriv('aes-256-gcm', contentKey(shared, epk, keyId), iv);
        decipher.setAAD(aadOf(keyId, holdoutHash));
        decipher.setAuthTag(tag);
        text = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
        throw new HoldoutError('Holdout could not be opened');
    }
    let plain: HoldoutPlain;
    try {
        plain = checkHoldout(JSON.parse(text) as HoldoutPlain);
    } catch {
        throw new HoldoutError('Holdout content is not valid');
    }
    if (holdoutHashOf(plain) !== holdoutHash) throw new HoldoutError('Holdout does not match its hash');
    return plain;
};

export const publicKeyOf = (privateKeyB64: string): { publicKey: string; keyId: string } => {
    const pub = createPublicKey(readKey(privateKeyB64, 'private'));
    return { publicKey: spkiOf(pub).toString('base64'), keyId: keyIdOf(pub) };
};

export const generateHoldoutKeys = (): { publicKey: string; privateKey: string; keyId: string } => {
    const pair = generateKeyPairSync('x25519');
    return {
        publicKey: spkiOf(pair.publicKey).toString('base64'),
        privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
        keyId: keyIdOf(pair.publicKey),
    };
};

export const holdoutCounts = (log: string): { passed: number; failed: number } => {
    const totals = { passed: 0, failed: 0 };
    for (const m of log.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)) {
        totals.passed += Number(m[1]);
        totals.failed += Number(m[2]);
    }
    return totals;
};
