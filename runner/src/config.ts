import 'dotenv/config';
import path from 'node:path';

const num = (name: string, fallback: number): number => {
    const raw = process.env[name];
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
    return value;
};

const list = (name: string, fallback: string[]): string[] => {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

const runnerKey = process.env['AGORA_RUNNER_KEY'] ?? '';
if (runnerKey.length < 16) throw new Error('AGORA_RUNNER_KEY must be set and at least 16 characters');

export const config = {
    port: num('PORT', 4100),
    runnerKey,
    internalKey: process.env['AGORA_INTERNAL_KEY'] ?? '',
    logDir: path.resolve(process.env['AGORA_RUNNER_LOG_DIR'] ?? 'logs'),
    workDir: path.resolve(process.env['AGORA_RUNNER_WORK_DIR'] ?? 'work'),
    image: process.env['AGORA_RUNNER_IMAGE'] ?? 'agora-runner-rust',
    repoHosts: list('AGORA_RUNNER_REPO_HOSTS', ['github.com', 'gitlab.com']),
    devRepoDir: process.env['AGORA_RUNNER_DEV_REPO_DIR'] ? path.resolve(process.env['AGORA_RUNNER_DEV_REPO_DIR']) : null,
    maxParallel: num('AGORA_RUNNER_MAX_PARALLEL', 2),
    cpus: process.env['AGORA_RUNNER_CPUS'] ?? '2',
    memory: process.env['AGORA_RUNNER_MEMORY'] ?? '2g',
    pids: num('AGORA_RUNNER_PIDS', 512),
    defaultTimeoutSec: 480,
    maxTimeoutSec: 540,
    diffCapBytes: 200 * 1024,
    logTailBytes: 8 * 1024,
};
