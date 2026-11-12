import { InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_REF = 'env:AGORA_LIMIT_KEY:v1';

const limitKey = (): Buffer => {
    const raw = process.env['AGORA_LIMIT_KEY'] ?? '';
    const key = Buffer.from(raw, raw.length === 64 ? 'hex' : 'base64');
    if (key.length !== 32) throw new InternalServerErrorException('Hidden budgets are not configured on the server');
    return key;
};

export const sealLimit = (amount: number): { ciphertext: string; keyRef: string } => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', limitKey(), iv);
    const body = Buffer.concat([cipher.update(amount.toFixed(6), 'utf8'), cipher.final()]);
    return { ciphertext: [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.'), keyRef: KEY_REF };
};

export const openLimit = (ciphertext: string): number => {
    const [iv, tag, body] = ciphertext.split('.').map((p) => Buffer.from(p, 'base64'));
    if (!iv || !tag || !body) throw new Error('Malformed hidden budget');
    const decipher = createDecipheriv('aes-256-gcm', limitKey(), iv);
    decipher.setAuthTag(tag);
    return Number(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
};
