import 'dotenv/config';
import { readFile } from 'node:fs/promises';

const [repoUrl, base, good, cheat, lockedTestPath, lockedTestFile] = process.argv.slice(2);
if (!repoUrl || !base || !good || !cheat || !lockedTestPath || !lockedTestFile) {
    console.error('usage: smoke <repoUrl> <base> <goodCommit> <cheatCommit> <lockedTestPath> <lockedTestFile>');
    process.exit(2);
}

const url = process.env['RUNNER_URL'] ?? `http://localhost:${process.env['PORT'] ?? 4100}`;
const key = process.env['AGORA_RUNNER_KEY'] ?? '';
const content = await readFile(lockedTestFile, 'utf8');

const post = async (body: unknown, headers: Record<string, string> = { 'x-runner-key': key }) => {
    const res = await fetch(`${url}/run`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const request = (commit: string) => ({
    repoUrl, commit, baseCommit: base,
    testCommand: 'cargo test --quiet', buildCommand: 'cargo build --quiet',
    testFiles: [{ path: lockedTestPath, content }],
    allowedPaths: ['src/**'], baseline: true,
});

const cases: [string, () => Promise<{ status: number; body: Record<string, unknown> }>, (r: { status: number; body: Record<string, unknown> }) => boolean][] = [
    ['good fix passes', () => post(request(good)), (r) => r.status === 200 && r.body['error'] === null && r.body['exitCode'] === 0 && r.body['installExit'] === 0 && r.body['scopeOk'] === true && r.body['baselineExitCode'] !== 0],
    ['cheating fix fails on locked test', () => post(request(cheat)), (r) => r.status === 200 && r.body['error'] === null && r.body['exitCode'] !== 0 && r.body['scopeOk'] === false],
    ['unknown commit is bad_commit', () => post(request('0000000deadbeef')), (r) => r.status === 200 && r.body['error'] === 'bad_commit'],
    ['wrong key is 401', () => post(request(good), { 'x-runner-key': 'wrong' }), (r) => r.status === 401],
    ['http repo is 400', () => post({ ...request(good), repoUrl: 'http://github.com/x/y' }), (r) => r.status === 400],
];

let failed = 0;
for (const [name, run, ok] of cases) {
    const r = await run();
    const pass = ok(r);
    if (!pass) failed += 1;
    const b = r.body;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  status=${r.status} error=${b['error'] ?? '-'} exit=${b['exitCode'] ?? '-'} build=${b['installExit'] ?? '-'} baseline=${b['baselineExitCode'] ?? '-'} scope=${b['scopeOk'] ?? '-'} changed=${JSON.stringify(b['changedFiles'] ?? b['message'] ?? '')} ms=${b['durationMs'] ?? '-'}`);
}
process.exit(failed ? 1 : 0);
