import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { config } from './config.js';
const DOCKER_ERROR_CODES = new Set([125]);
export const containerName = (runId, step) => `agora-run-${runId}-${step}`.slice(0, 120);
export const buildDockerArgs = (opts) => {
    const args = [
        'run', '--rm',
        '--name', containerName(opts.runId, opts.name),
        '--network', opts.network ? 'bridge' : 'none',
        '--read-only',
        '--tmpfs', '/tmp:rw,exec,nosuid,size=512m',
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges',
        '--pids-limit', String(config.pids),
        '--memory', config.memory,
        '--memory-swap', config.memory,
        '--cpus', config.cpus,
        '--user', '1000:1000',
        '-v', `${opts.workDir}:/work`,
        '-w', '/work',
        '-e', 'HOME=/work/home',
        '-e', 'CARGO_HOME=/work/cargo',
        '-e', 'CARGO_TARGET_DIR=/work/target',
    ];
    if (!opts.network)
        args.push('-e', 'CARGO_NET_OFFLINE=true');
    if (opts.devRepoMount)
        args.push('-v', `${opts.devRepoMount}:/src:ro`);
    for (const [host, target] of opts.extraMounts ?? [])
        args.push('--mount', `type=bind,source=${host},target=${target},readonly`);
    for (const [key, value] of Object.entries(opts.env ?? {}))
        args.push('-e', `${key}=${value}`);
    args.push(config.image, 'sh', '-c', opts.script);
    return args;
};
const killContainer = (name) => new Promise((resolve) => {
    const p = spawn('docker', ['kill', name], { stdio: 'ignore' });
    p.on('close', () => resolve());
    p.on('error', () => resolve());
});
export const runStep = async (opts) => {
    const started = Date.now();
    await appendFile(opts.logFile, `\n=== step ${opts.name} (network ${opts.network ? 'on' : 'off'}) ===\n`);
    if (opts.timeoutMs <= 0) {
        await appendFile(opts.logFile, '=== skipped: no time left ===\n');
        return { exitCode: null, durationMs: 0, timedOut: true, dockerFailed: false };
    }
    return new Promise((resolve) => {
        let timedOut = false;
        let pending = Promise.resolve();
        const write = (chunk) => {
            pending = pending.then(() => appendFile(opts.logFile, chunk)).catch(() => undefined);
        };
        const child = spawn('docker', buildDockerArgs(opts), { stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', write);
        child.stderr.on('data', write);
        const timer = setTimeout(() => {
            timedOut = true;
            void killContainer(containerName(opts.runId, opts.name));
        }, opts.timeoutMs);
        const finish = (code, spawnError) => {
            clearTimeout(timer);
            const durationMs = Date.now() - started;
            void pending.then(async () => {
                await appendFile(opts.logFile, `=== exit ${timedOut ? 'timeout' : code} in ${durationMs} ms ===\n`).catch(() => undefined);
                resolve({
                    exitCode: timedOut ? null : code,
                    durationMs,
                    timedOut,
                    dockerFailed: spawnError || (!timedOut && code !== null && DOCKER_ERROR_CODES.has(code)),
                });
            });
        };
        child.on('error', () => finish(null, true));
        child.on('close', (code) => finish(code, false));
    });
};
