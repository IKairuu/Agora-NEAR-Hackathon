import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateHoldoutKeys, HOLDOUT_ALG, holdoutCounts, holdoutHashOf, openHoldout, publicKeyOf, sealHoldout } from '../src/holdout.js';
import { runRequestSchema, runResultSchema } from '../src/schema.js';

const SECRET = 'fn hidden_case_secret_name() { assert_eq!(1 + 1, 2); }';
const plain = { command: null, files: [{ path: 'tests/hidden_a.rs', content: SECRET }, { path: 'tests/hidden_b.rs', content: 'b' }] };

const flip = (b64: string): string => {
    const buf = Buffer.from(b64, 'base64');
    buf[0] = buf[0]! ^ 1;
    return buf.toString('base64');
};

describe('holdout sealing', () => {
    const keys = generateHoldoutKeys();

    it('opens what it seals', () => {
        const sealed = sealHoldout(keys.publicKey, plain);
        assert.equal(sealed.keyId, keys.keyId);
        assert.deepEqual(openHoldout(keys.privateKey, sealed.blob, sealed.holdoutHash), plain);
    });

    it('keeps the plaintext out of the blob', () => {
        const sealed = sealHoldout(keys.publicKey, plain);
        assert.ok(!sealed.blob.includes('hidden_case_secret_name'));
        assert.ok(!sealed.blob.includes('tests/hidden_a.rs'));
        const env = JSON.parse(sealed.blob) as Record<string, unknown>;
        assert.equal(env['v'], 1);
        assert.equal(env['alg'], HOLDOUT_ALG);
    });

    it('hashes the same set the same way regardless of order and sealing', () => {
        const reversed = { command: null, files: [...plain.files].reverse() };
        assert.equal(holdoutHashOf(plain), holdoutHashOf(reversed));
        assert.equal(sealHoldout(keys.publicKey, plain).holdoutHash, sealHoldout(keys.publicKey, reversed).holdoutHash);
        assert.notEqual(sealHoldout(keys.publicKey, plain).blob, sealHoldout(keys.publicKey, plain).blob);
        assert.match(holdoutHashOf(plain), /^[0-9a-f]{64}$/);
        assert.notEqual(holdoutHashOf(plain), holdoutHashOf({ command: 'cargo test --test hidden_a', files: plain.files }));
        assert.notEqual(holdoutHashOf(plain), holdoutHashOf({ command: null, files: [plain.files[0]!, { path: 'tests/hidden_b.rs', content: 'c' }] }));
    });

    it('rejects a tampered blob', () => {
        const sealed = sealHoldout(keys.publicKey, plain);
        const env = JSON.parse(sealed.blob) as Record<string, string>;
        for (const field of ['ct', 'tag', 'iv', 'epk']) {
            const bad = JSON.stringify({ ...env, [field]: flip(env[field]!) });
            assert.throws(() => openHoldout(keys.privateKey, bad, sealed.holdoutHash));
        }
        assert.throws(() => openHoldout(keys.privateKey, JSON.stringify({ ...env, v: 2 }), sealed.holdoutHash), /version/);
        assert.throws(() => openHoldout(keys.privateKey, 'not json', sealed.holdoutHash), /malformed/);
    });

    it('rejects a blob opened against another hash', () => {
        const sealed = sealHoldout(keys.publicKey, plain);
        assert.throws(() => openHoldout(keys.privateKey, sealed.blob, 'ab'.repeat(32)), /could not be opened/);
    });

    it('cannot be opened without the matching private key', () => {
        const sealed = sealHoldout(keys.publicKey, plain);
        const other = generateHoldoutKeys();
        assert.throws(() => openHoldout(other.privateKey, sealed.blob, sealed.holdoutHash), /another runner key/);
        const forged = JSON.stringify({ ...(JSON.parse(sealed.blob) as object), kid: other.keyId });
        assert.throws(() => openHoldout(other.privateKey, forged, sealed.holdoutHash), /could not be opened/);
        assert.throws(() => openHoldout(keys.publicKey, sealed.blob, sealed.holdoutHash), /private key/);
    });

    it('derives the published public key from the private key', () => {
        assert.deepEqual(publicKeyOf(keys.privateKey), { publicKey: keys.publicKey, keyId: keys.keyId });
    });

    it('error messages never carry the hidden content', () => {
        const sealed = sealHoldout(keys.publicKey, plain);
        const env = JSON.parse(sealed.blob) as Record<string, string>;
        try {
            openHoldout(keys.privateKey, JSON.stringify({ ...env, ct: flip(env['ct']!) }), sealed.holdoutHash);
            assert.fail('expected an error');
        } catch (err) {
            assert.ok(!(err as Error).message.includes('hidden'));
        }
    });

    it('refuses unsafe paths', () => {
        assert.throws(() => sealHoldout(keys.publicKey, { command: null, files: [{ path: '../escape.rs', content: 'x' }] }), /path/);
        assert.throws(() => sealHoldout(keys.publicKey, { command: null, files: [{ path: '/abs.rs', content: 'x' }] }), /path/);
        assert.throws(() => sealHoldout(keys.publicKey, { command: null, files: [] }), /1 to 50/);
    });

    it('counts cargo results without names', () => {
        const log = 'test hidden_x ... ok\ntest result: ok. 3 passed; 0 failed; 0 ignored\ntest result: FAILED. 1 passed; 2 failed; 0 ignored\n';
        assert.deepEqual(holdoutCounts(log), { passed: 4, failed: 2 });
    });
});

describe('run schema', () => {
    const base = { repoUrl: 'https://github.com/a/b', commit: 'abcdef1', baseCommit: 'main', testCommand: 'cargo test --no-fail-fast' };

    it('needs a hash with a sealed blob', () => {
        assert.equal(runRequestSchema.safeParse({ ...base, holdoutBlob: '{}' }).success, false);
        assert.equal(runRequestSchema.safeParse({ ...base, holdoutBlob: '{}', holdoutRef: 'ab'.repeat(32) }).success, true);
        assert.equal(runRequestSchema.safeParse({ ...base, holdoutRef: 'not-a-hash' }).success, false);
        assert.equal(runRequestSchema.safeParse(base).success, true);
    });

    it('reports hidden checks as an exit code and counts only', () => {
        const shape = Object.keys(runResultSchema.shape).filter((k) => k.startsWith('holdout'));
        assert.deepEqual(shape.sort(), ['holdoutCounts', 'holdoutExit']);
    });
});
