import { createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, KeyObject } from 'node:crypto';
import * as holdout from './holdout';
import { ciphertextHashOf, HOLDOUT_ALG, holdoutHashOf, holdoutRunOf, sealHoldout } from './holdout';

const SECRET = 'fn hidden_secret_case() { assert!(true); }';
const plain = { command: null, files: [{ path: 'tests/hidden_b.rs', content: 'b' }, { path: 'tests/hidden_a.rs', content: SECRET }] };

const runnerOpen = (privateKey: KeyObject, ciphertext: Buffer, hash: string): unknown => {
    const env = JSON.parse(ciphertext.toString('utf8')) as Record<string, string>;
    const kid = createHash('sha256').update(createPublicKey(privateKey).export({ format: 'der', type: 'spki' })).digest('hex').slice(0, 16);
    const epk = Buffer.from(env['epk']!, 'base64');
    const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: epk, format: 'der', type: 'spki' }) });
    const key = Buffer.from(hkdfSync('sha256', shared, epk, `agora-holdout:v1:${kid}`, 32));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env['iv']!, 'base64'));
    decipher.setAAD(Buffer.from(`${HOLDOUT_ALG}|v1|${kid}|${hash}`));
    decipher.setAuthTag(Buffer.from(env['tag']!, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(env['ct']!, 'base64')), decipher.final()]).toString('utf8'));
};

const flip = (b64: string): string => {
    const buf = Buffer.from(b64, 'base64');
    buf[0] = buf[0]! ^ 1;
    return buf.toString('base64');
};

describe('holdout sealing', () => {
    const env = { ...process.env };
    const pair = generateKeyPairSync('x25519');

    beforeEach(() => {
        process.env['AGORA_HOLDOUT_PUBLIC_KEY'] = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    });

    afterEach(() => { process.env = { ...env }; });

    it('seals so the runner key opens it', () => {
        const sealed = sealHoldout(plain);
        expect(runnerOpen(pair.privateKey, sealed.ciphertext, sealed.holdoutHash)).toEqual(plain);
        expect(sealed.keyId).toMatch(/^[0-9a-f]{16}$/);
        const blob = JSON.parse(sealed.ciphertext.toString('utf8')) as Record<string, unknown>;
        expect(blob).toMatchObject({ v: 1, alg: HOLDOUT_ALG, kid: sealed.keyId });
    });

    it('keeps the plaintext out of the ciphertext', () => {
        const text = sealHoldout(plain).ciphertext.toString('utf8');
        expect(text).not.toContain('hidden_secret_case');
        expect(text).not.toContain('tests/hidden_a.rs');
    });

    it('gives the backend only a way to seal, never to open', () => {
        expect(Object.keys(holdout).sort()).toEqual(['HOLDOUT_ALG', 'HOLDOUT_VERSION', 'ciphertextHashOf', 'holdoutHashOf', 'holdoutRunOf', 'sealHoldout']);
        expect(() => createPrivateKey({ key: Buffer.from(process.env['AGORA_HOLDOUT_PUBLIC_KEY']!, 'base64'), format: 'der', type: 'pkcs8' })).toThrow();
        const sealed = sealHoldout(plain);
        const other = generateKeyPairSync('x25519');
        expect(() => runnerOpen(other.privateKey, sealed.ciphertext, sealed.holdoutHash)).toThrow();
    });

    it('rejects a tampered blob or a different hash', () => {
        const sealed = sealHoldout(plain);
        const blob = JSON.parse(sealed.ciphertext.toString('utf8')) as Record<string, string>;
        for (const field of ['ct', 'tag', 'iv', 'epk']) {
            const bad = Buffer.from(JSON.stringify({ ...blob, [field]: flip(blob[field]!) }));
            expect(() => runnerOpen(pair.privateKey, bad, sealed.holdoutHash)).toThrow();
        }
        expect(() => runnerOpen(pair.privateKey, sealed.ciphertext, 'ab'.repeat(32))).toThrow();
    });

    it('hashes the plaintext set stably and the same way as the runner', () => {
        expect(holdoutHashOf(plain)).toBe(holdoutHashOf({ command: null, files: [...plain.files].reverse() }));
        expect(sealHoldout(plain).holdoutHash).toBe(sealHoldout(plain).holdoutHash);
        expect(sealHoldout(plain).ciphertext.equals(sealHoldout(plain).ciphertext)).toBe(false);
        expect(holdoutHashOf({ command: null, files: [{ path: 'tests/b.rs', content: 'b' }, { path: 'tests/a.rs', content: 'a' }] }))
            .toBe('9f90b2c4198857fe635bea73336690b968f2df52d39f9e5d6eab26fa23071995');
        expect(holdoutHashOf({ command: 'cargo test --test a', files: [{ path: 'tests/a.rs', content: 'a' }] }))
            .toBe('93bc46f64dde87f37bb01cdac0f9ae18f8c4063af63757e668bf6da34dd0e03a');
    });

    it('refuses to seal without a valid runner public key', () => {
        delete process.env['AGORA_HOLDOUT_PUBLIC_KEY'];
        expect(() => sealHoldout(plain)).toThrow('Hidden tests are not configured on the server');
        process.env['AGORA_HOLDOUT_PUBLIC_KEY'] = 'bm90IGEga2V5';
        expect(() => sealHoldout(plain)).toThrow('Hidden tests are not configured on the server');
    });

    it('builds the runner fields only when a holdout exists', () => {
        const sealed = sealHoldout(plain);
        expect(holdoutRunOf({ holdoutHash: null, holdout: null })).toEqual({});
        expect(holdoutRunOf({ holdoutHash: sealed.holdoutHash, holdout: { holdoutHash: sealed.holdoutHash, ciphertext: new Uint8Array(sealed.ciphertext) } }))
            .toEqual({ holdoutRef: sealed.holdoutHash, holdoutBlob: sealed.ciphertext.toString('utf8') });
        expect(holdoutRunOf({ holdoutHash: sealed.holdoutHash, holdout: null })).toEqual({ holdoutRef: sealed.holdoutHash });
        expect(ciphertextHashOf(sealed.ciphertext)).toMatch(/^[0-9a-f]{64}$/);
    });
});
