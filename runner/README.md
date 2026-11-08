# AGORA Runner

Runs a delivered commit against the locked acceptance tests inside throwaway Docker containers and returns the result. The request and response contract is in [src/schema.ts](src/schema.ts).

## Run it

Requirements: Node 20 or later and Docker.

```sh
npm install
npm run image
cp .env.example .env
npm run build && npm start
```

Set `AGORA_RUNNER_KEY` in `.env` to a random value of at least 16 characters, for example `openssl rand -hex 24`. Callers send it in the `x-runner-key` header. Docker must be running before you start the runner.

## Endpoints

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| `POST` | `/run` | `x-runner-key` | Runs one delivery. It replies with the result, or with `202 { runId }` when `callbackUrl` is set and the result is POSTed there later |
| `GET` | `/logs/:runId` | `x-runner-key` | The full log. Its sha256 equals `logSha256` |
| `GET` | `/health` | none | `{ "ok": true }` |

`200` means the run finished, even when the tests failed. Runner problems also return `200`, with `error` set to `clone_failed`, `bad_commit`, `timeout`, `docker_failed` or `internal`. Bad input returns `400` and a bad key returns `401`.

## What a run does

1. **clone** (network on): clones the repo, resolves both commits and checks that `commit` descends from `baseCommit`. It computes the diff, then downloads dependencies. No repository code runs in this step.
2. **checkout** (network off): checks out `commit` and clears the paths of the locked test files.
3. **build**: runs `buildCommand`, with the locked test files mounted read-only.
4. **test**: runs `testCommand`, with the locked test files mounted read-only.
5. **baseline** (optional): runs `testCommand` at `baseCommit`. It runs last, so it cannot affect the delivered result.

Every step runs in a fresh container with:
- the network off, except during clone
- a non-root user
- a read-only root filesystem
- all Linux capabilities dropped and `no-new-privileges` set
- CPU, memory and pid limits
- an overall timeout

Locked test files live outside the shared work directory and are bind-mounted read-only, so delivered code, including build scripts, cannot change them. The work directory is deleted after every run.

## J-1042 fixture

[fixtures/j1042](fixtures/j1042) is a small payroll crate whose `split_payment` loses dust. It has 31 passing tests and 2 named failing tests in `tests/split_rounding.rs`. Four deliveries are stored as files that replace the base files:

| Delivery | What it does | Expected |
| --- | --- | --- |
| `good` | Gives the remainder to the last worker | pass: 33 of 33 tests, scope ok |
| `wrong-fix` | Gives the remainder to the first worker | fail: `test_split_dust_to_last` fails |
| `out-of-scope` | Correct fix, plus a planted change in `src/fees.rs` | fail: tests pass, scope fails |
| `edits-test` | Weakens the locked test instead of fixing the bug | fail: the locked test still runs |

The test script builds a git repository from these files with fixed commit hashes and sends every case to `/run`. Set `AGORA_RUNNER_DEV_REPO_DIR` to the absolute path of `.fixtures` and create the folder before you start the runner. Dev mode lets the runner clone local repositories as `file:///src/<name>`, so use it only for local testing.

```sh
mkdir -p .fixtures
npm start
npm run test:j1042
```

Use `cargo test --no-fail-fast` as the test command, so every test binary runs even after one fails.

## Limits

- The image ships Rust stable and `wasm32-unknown-unknown`. `cargo near build` needs `cargo-near` added to the image.
- Hidden holdout tests are not supported yet. `holdoutExit` is always `null`.
- The runner needs access to the Docker engine, so run it on a host or VM that is used only for running deliveries.
