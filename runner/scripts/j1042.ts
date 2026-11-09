import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'fixtures', 'j1042');
const devDir = path.resolve(process.env['AGORA_RUNNER_DEV_REPO_DIR'] ?? path.join(root, '.fixtures'));
const repoDir = path.join(devDir, 'j1042');
const url = process.env['RUNNER_URL'] ?? `http://localhost:${process.env['PORT'] ?? 4100}`;
const key = process.env['AGORA_RUNNER_KEY'] ?? '';
const LOCKED = 'tests/split_rounding.rs';

const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'AGORA Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@agora.example',
    GIT_COMMITTER_NAME: 'AGORA Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@agora.example',
    GIT_AUTHOR_DATE: '2026-11-01T09:00:00Z',
    GIT_COMMITTER_DATE: '2026-11-01T09:00:00Z',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
};

const git = (...args: string[]): string => execFileSync('git', args, { cwd: repoDir, env: gitEnv, encoding: 'utf8' }).trim();

const buildRepo = (): Record<string, string> => {
    rmSync(repoDir, { recursive: true, force: true });
    mkdirSync(repoDir, { recursive: true });
    cpSync(path.join(fixture, 'base'), repoDir, { recursive: true });
    git('init', '--quiet', '--initial-branch', 'main');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'payroll vault: split_payment loses dust');
    const shas: Record<string, string> = { base: git('rev-parse', 'HEAD') };
    for (const name of ['good', 'wrong-fix', 'out-of-scope', 'edits-test']) {
        git('checkout', '--quiet', '-B', name, 'main');
        cpSync(path.join(fixture, 'commits', name), repoDir, { recursive: true });
        git('add', '-A');
        git('commit', '--quiet', '-m', `delivery: ${name}`);
        shas[name] = git('rev-parse', 'HEAD');
    }
    git('checkout', '--quiet', 'main');
    return shas;
};

type Result = Record<string, unknown> & { status: number };

const post = async (body: unknown, runnerKey = key): Promise<Result> => {
    const res = await fetch(`${url}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-runner-key': runnerKey },
        body: JSON.stringify(body),
    });
    return { status: res.status, ...((await res.json()) as Record<string, unknown>) };
};

const fetchLog = async (runId: string): Promise<string> => {
    const res = await fetch(`${url}/logs/${runId}`, { headers: { 'x-runner-key': key } });
    return res.text();
};

const counts = (log: string, step: string): { passed: number; failed: number } => {
    const section = log.split(/\n=== step /).find((s) => s.startsWith(`${step} `)) ?? '';
    const totals = { passed: 0, failed: 0 };
    for (const m of section.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)) {
        totals.passed += Number(m[1]);
        totals.failed += Number(m[2]);
    }
    return totals;
};

const verdict = (r: Result): 'pass' | 'fail' =>
    r['error'] === null && r['exitCode'] === 0 && r['installExit'] === 0 && r['scopeOk'] === true ? 'pass' : 'fail';

const shas = buildRepo();
const lockedTest = readFileSync(path.join(fixture, 'base', LOCKED), 'utf8');

const request = (commit: string) => ({
    repoUrl: 'file:///src/j1042',
    baseCommit: shas['base'],
    commit,
    testCommand: 'cargo test --no-fail-fast',
    buildCommand: 'cargo build --release --target wasm32-unknown-unknown',
    testFiles: [{ path: LOCKED, content: lockedTest }],
    allowedPaths: ['src/split.rs'],
    failingTests: ['test_split_rounding', 'test_split_dust_to_last'],
    baseline: true,
});

interface Case {
    name: string;
    run: () => Promise<Result>;
    expect: (r: Result, log: string) => string | null;
}

const cases: Case[] = [
    {
        name: 'good fix is released',
        run: () => post(request(shas['good']!)),
        expect: (r, log) => {
            if (verdict(r) !== 'pass') return 'expected pass';
            const after = counts(log, 'test');
            const before = counts(log, 'baseline');
            if (after.passed !== 33 || after.failed !== 0) return `expected 33 passed after, got ${after.passed}/${after.failed}`;
            if (before.passed !== 31 || before.failed !== 2) return `expected 31 passed and 2 failed before, got ${before.passed}/${before.failed}`;
            return null;
        },
    },
    {
        name: 'wrong fix fails a named test',
        run: () => post(request(shas['wrong-fix']!)),
        expect: (r) => (verdict(r) === 'fail' && r['scopeOk'] === true && r['exitCode'] !== 0 ? null : 'expected failing tests with scope ok'),
    },
    {
        name: 'out-of-scope edit is rejected',
        run: () => post(request(shas['out-of-scope']!)),
        expect: (r) => (verdict(r) === 'fail' && r['exitCode'] === 0 && r['scopeOk'] === false ? null : 'expected passing tests with scope fail'),
    },
    {
        name: 'weakened test is overridden by the locked one',
        run: () => post(request(shas['edits-test']!)),
        expect: (r) => (verdict(r) === 'fail' && r['exitCode'] !== 0 && r['scopeOk'] === false ? null : 'expected failing locked tests'),
    },
    {
        name: 'unknown commit is bad_commit',
        run: () => post(request('0000000deadbeef')),
        expect: (r) => (r.status === 200 && r['error'] === 'bad_commit' ? null : 'expected bad_commit'),
    },
    {
        name: 'wrong key is refused',
        run: () => post(request(shas['good']!), 'wrong-key'),
        expect: (r) => (r.status === 401 ? null : 'expected 401'),
    },
];

console.log(`fixture repo ${repoDir}`);
for (const [name, sha] of Object.entries(shas)) console.log(`  ${name.padEnd(13)} ${sha}`);
console.log('');

let failures = 0;
for (const c of cases) {
    const r = await c.run();
    const log = typeof r['runId'] === 'string' && r.status === 200 ? await fetchLog(r['runId']) : '';
    const problem = c.expect(r, log);
    if (problem) failures += 1;
    const after = log ? counts(log, 'test') : null;
    const detail = r.status === 200
        ? `verdict=${verdict(r)} tests=${r['exitCode'] ?? '-'} build=${r['installExit'] ?? '-'} scope=${r['scopeOk'] ?? '-'} error=${r['error'] ?? '-'} changed=${JSON.stringify(r['changedFiles'])}${after ? ` passed=${after.passed} failed=${after.failed}` : ''} ms=${r['durationMs']}`
        : `status=${r.status}`;
    console.log(`${problem ? 'FAIL' : 'PASS'}  ${c.name.padEnd(46)} ${detail}${problem ? `  <- ${problem}` : ''}`);
}
process.exit(failures ? 1 : 0);
