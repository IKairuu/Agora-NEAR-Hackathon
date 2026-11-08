import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { runStep } from './docker.js';
import { scopeOk } from './glob.js';
const EXIT_CLONE_FAILED = 40;
const EXIT_COMMIT_MISSING = 41;
const EXIT_NOT_DESCENDANT = 42;
const CLONE_SCRIPT = `
git clone --quiet --no-tags "$REPO_URL" /work/repo || exit ${EXIT_CLONE_FAILED}
cd /work/repo
resolve() { git rev-parse --verify --quiet "$1^{commit}" || git rev-parse --verify --quiet "origin/$1^{commit}"; }
C=$(resolve "$COMMIT") || { git fetch --quiet origin "$COMMIT" 2>/dev/null && C=$(resolve "$COMMIT"); } || exit ${EXIT_COMMIT_MISSING}
B=$(resolve "$BASE") || { git fetch --quiet origin "$BASE" 2>/dev/null && B=$(resolve "$BASE"); } || exit ${EXIT_COMMIT_MISSING}
git merge-base --is-ancestor "$B" "$C" || exit ${EXIT_NOT_DESCENDANT}
printf %s "$B" > /work/meta/base.sha
printf %s "$C" > /work/meta/commit.sha
git -c core.quotepath=false diff --no-ext-diff --no-textconv --name-only "$B" "$C" > /work/meta/changed.txt
git diff --no-ext-diff --no-textconv --shortstat "$B" "$C" > /work/meta/shortstat.txt
git diff --no-ext-diff --no-textconv --no-color "$B" "$C" | head -c ${config.diffCapBytes} > /work/meta/diff.txt
fetch_deps() {
    git checkout --quiet --force "$1" && git clean --quiet -ffdx
    if [ -f Cargo.toml ]; then (cd /work && cargo fetch --quiet --manifest-path repo/Cargo.toml) || echo "dependency fetch failed at $1"; fi
}
fetch_deps "$B"
fetch_deps "$C"
true
`;
const CHECKOUT_SCRIPT = `
cd /work/repo || exit 1
git checkout --quiet --force "$TARGET_SHA" && git clean --quiet -ffdx || exit 1
printf '%s\\n' "$LOCKED_PATHS" | while IFS= read -r p; do
    [ -z "$p" ] && continue
    rm -rf -- "$p"
    mkdir -p -- "$(dirname -- "$p")"
    : > "$p"
done
`;
const COMMAND_SCRIPT = 'cd /work/repo && sh -c "$RUN_COMMAND"';
let imageIdCache = null;
const imageId = async () => {
    if (imageIdCache)
        return imageIdCache;
    const id = await new Promise((resolve) => {
        let out = '';
        const p = spawn('docker', ['image', 'inspect', '--format', '{{.Id}}', config.image]);
        p.stdout.on('data', (d) => (out += d.toString()));
        p.on('close', (code) => resolve(code === 0 ? out.trim() : ''));
        p.on('error', () => resolve(''));
    });
    imageIdCache = id ? `${config.image}@${id}` : null;
    return id ? `${config.image}@${id}` : config.image;
};
export const checkRepoUrl = (repoUrl) => {
    if (repoUrl.startsWith('file:///src/')) {
        if (!config.devRepoDir)
            return 'Local repositories are only allowed in dev mode';
        if (repoUrl.includes('..'))
            return 'Repository path is not allowed';
        return null;
    }
    let url;
    try {
        url = new URL(repoUrl);
    }
    catch {
        return 'Repository URL is not valid';
    }
    if (url.protocol !== 'https:')
        return 'Repository URL must use https';
    if (url.username || url.password)
        return 'Repository URL must not contain credentials';
    if (!config.repoHosts.includes(url.hostname.toLowerCase()))
        return `Repository host ${url.hostname} is not allowed`;
    return null;
};
const readMeta = async (file, cap) => {
    try {
        const info = await lstat(file);
        if (!info.isFile())
            return '';
        const handle = await open(file, 'r');
        try {
            const buf = Buffer.alloc(Math.min(info.size, cap));
            await handle.read(buf, 0, buf.length, 0);
            return buf.toString('utf8');
        }
        finally {
            await handle.close();
        }
    }
    catch {
        return '';
    }
};
const readTail = async (file, bytes) => {
    const info = await lstat(file);
    const handle = await open(file, 'r');
    try {
        const len = Math.min(info.size, bytes);
        const buf = Buffer.alloc(len);
        await handle.read(buf, 0, len, info.size - len);
        return buf.toString('utf8');
    }
    finally {
        await handle.close();
    }
};
const sha256File = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
export const parseShortstat = (text) => {
    const pick = (re) => Number(re.exec(text)?.[1] ?? 0);
    return {
        files: pick(/(\d+) files? changed/),
        insertions: pick(/(\d+) insertions?\(\+\)/),
        deletions: pick(/(\d+) deletions?\(-\)/),
    };
};
export const executeRun = async (req) => {
    const started = Date.now();
    const runId = req.runId ?? randomUUID();
    const timeoutSec = Math.min(req.timeoutSec ?? config.defaultTimeoutSec, config.maxTimeoutSec);
    const deadline = started + timeoutSec * 1000;
    const remaining = () => deadline - Date.now();
    const workDir = path.join(config.workDir, runId);
    const testsDir = path.join(config.workDir, `${runId}-tests`);
    const logFile = path.join(config.logDir, `${runId}.log`);
    const testFiles = req.testFiles ?? [];
    const steps = [];
    const result = {
        runId,
        deliveryId: req.deliveryId ?? null,
        error: null,
        exitCode: null,
        installExit: null,
        baselineExitCode: null,
        changedFiles: [],
        scopeOk: null,
        diffStats: { files: 0, insertions: 0, deletions: 0 },
        diffText: '',
        logTail: '',
        logSha256: '',
        logPath: `/logs/${runId}`,
        durationMs: 0,
        timedOut: false,
        holdoutExit: null,
        failingTests: req.failingTests ?? [],
        image: await imageId(),
        steps,
    };
    await mkdir(config.logDir, { recursive: true });
    await writeFile(logFile, `run ${runId}\nrepo ${req.repoUrl}\nbase ${req.baseCommit}\ncommit ${req.commit}\n`);
    for (const dir of [workDir, path.join(workDir, 'meta'), path.join(workDir, 'home'), testsDir]) {
        await mkdir(dir, { recursive: true });
        await chmod(dir, 0o777);
    }
    const testMounts = [];
    for (const file of testFiles) {
        const target = path.resolve(testsDir, file.path);
        if (!target.startsWith(testsDir + path.sep))
            throw new Error('Test file path escapes the work directory');
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content);
        testMounts.push([target, `/work/repo/${file.path}`]);
    }
    const lockedPaths = testFiles.map((f) => f.path).join('\n');
    const step = async (name, script, extra) => {
        const outcome = await runStep({
            runId,
            name,
            script,
            workDir,
            logFile,
            network: false,
            timeoutMs: remaining(),
            devRepoMount: config.devRepoDir,
            ...extra,
        });
        steps.push({ name, exitCode: outcome.exitCode, durationMs: outcome.durationMs });
        return outcome;
    };
    const stop = (outcome) => {
        if (outcome.timedOut)
            return 'timeout';
        if (outcome.dockerFailed)
            return 'docker_failed';
        return null;
    };
    try {
        const clone = await step('clone', CLONE_SCRIPT, {
            network: true,
            env: { REPO_URL: req.repoUrl, COMMIT: req.commit, BASE: req.baseCommit },
        });
        result.error = stop(clone);
        if (!result.error && clone.exitCode !== 0) {
            result.error = clone.exitCode === EXIT_COMMIT_MISSING || clone.exitCode === EXIT_NOT_DESCENDANT ? 'bad_commit' : 'clone_failed';
        }
        let baseSha = '';
        let commitSha = '';
        if (!result.error) {
            const meta = path.join(workDir, 'meta');
            baseSha = (await readMeta(path.join(meta, 'base.sha'), 64)).trim();
            commitSha = (await readMeta(path.join(meta, 'commit.sha'), 64)).trim();
            result.changedFiles = (await readMeta(path.join(meta, 'changed.txt'), 1024 * 1024)).split('\n').filter(Boolean);
            result.diffStats = parseShortstat(await readMeta(path.join(meta, 'shortstat.txt'), 4096));
            result.diffText = await readMeta(path.join(meta, 'diff.txt'), config.diffCapBytes);
            result.scopeOk = req.allowedPaths ? scopeOk(result.changedFiles, req.allowedPaths) : null;
            if (!/^[0-9a-f]{40}$/.test(baseSha) || !/^[0-9a-f]{40}$/.test(commitSha))
                result.error = 'internal';
        }
        if (!result.error) {
            const checkout = await step('checkout', CHECKOUT_SCRIPT, { env: { TARGET_SHA: commitSha, LOCKED_PATHS: lockedPaths } });
            result.error = stop(checkout) ?? (checkout.exitCode === 0 ? null : 'internal');
        }
        if (!result.error) {
            if (req.buildCommand) {
                const build = await step('build', COMMAND_SCRIPT, { env: { RUN_COMMAND: req.buildCommand }, extraMounts: testMounts });
                result.error = stop(build);
                result.installExit = build.exitCode;
            }
            else {
                result.installExit = 0;
            }
        }
        if (!result.error) {
            const test = await step('test', COMMAND_SCRIPT, { env: { RUN_COMMAND: req.testCommand }, extraMounts: testMounts });
            result.error = stop(test);
            result.exitCode = test.exitCode;
        }
        if (!result.error && req.baseline) {
            const checkout = await step('baseline-checkout', CHECKOUT_SCRIPT, { env: { TARGET_SHA: baseSha, LOCKED_PATHS: lockedPaths } });
            const failed = stop(checkout);
            if (!failed && checkout.exitCode === 0) {
                const baseline = await step('baseline', COMMAND_SCRIPT, { env: { RUN_COMMAND: req.testCommand }, extraMounts: testMounts });
                result.error = stop(baseline);
                result.baselineExitCode = baseline.exitCode;
            }
            else {
                result.error = failed;
            }
        }
    }
    catch (err) {
        result.error = 'internal';
        await writeFile(logFile, `\ninternal error: ${err.message}\n`, { flag: 'a' }).catch(() => undefined);
    }
    result.timedOut = result.error === 'timeout';
    result.durationMs = Date.now() - started;
    result.logTail = await readTail(logFile, config.logTailBytes);
    result.logSha256 = await sha256File(logFile);
    await cleanup(runId, workDir, testsDir);
    return result;
};
const cleanup = async (runId, workDir, testsDir) => {
    const scratchLog = path.join(config.logDir, `${runId}.cleanup.log`);
    await runStep({
        runId,
        name: 'cleanup',
        script: 'find /work -mindepth 1 -delete 2>/dev/null; true',
        workDir,
        logFile: scratchLog,
        network: false,
        timeoutMs: 60_000,
    }).catch(() => undefined);
    await unlink(scratchLog).catch(() => undefined);
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(testsDir, { recursive: true, force: true }).catch(() => undefined);
};
