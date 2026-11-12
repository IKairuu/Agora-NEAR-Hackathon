import { generateHoldoutKeys } from '../src/holdout.js';

const keys = generateHoldoutKeys();
process.stdout.write([
    `# holdout key ${keys.keyId}`,
    '# runner/.env only. Keep it secret and never commit it.',
    `AGORA_RUNNER_HOLDOUT_PRIVATE_KEY=${keys.privateKey}`,
    '# backend/.env. Public, it can only seal.',
    `AGORA_HOLDOUT_PUBLIC_KEY=${keys.publicKey}`,
    '',
].join('\n'));
