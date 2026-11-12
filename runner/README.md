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
| `GET` | `/holdout-key` | none | The public key that seals hidden tests: `{ alg, keyId, publicKey }`. `404` when no holdout key is set |
| `GET` | `/health` | none | `{ "ok": true }` |

`200` means the run finished, even when the tests failed. Runner problems also return `200`, with `error` set to `clone_failed`, `bad_commit`, `timeout`, `docker_failed` or `internal`. Bad input returns `400` and a bad key returns `401`.

## What a run does

1. **clone** (network on): clones the repo, resolves both commits and checks that `commit` descends from `baseCommit`. It computes the diff, then downloads dependencies. No repository code runs in this step.
2. **checkout** (network off): checks out `commit` and clears the paths of the locked test files.
3. **build**: runs `buildCommand`, with the locked test files mounted read-only.
4. **test**: runs `testCommand`, with the locked test files mounted read-only.
5. **baseline** (optional): runs `testCommand` at `baseCommit`. It cannot affect the delivered result.
6. **holdout** (only with sealed hidden tests, and only when the locked tests pass): opens the hidden tests in memory, checks out `commit` again, mounts them read-only next to the locked tests and runs the hidden test command. See below.

Every step runs in a fresh container with:
- the network off, except during clone
- a non-root user
- a read-only root filesystem
- all Linux capabilities dropped and `no-new-privileges` set
- CPU, memory and pid limits
- an overall timeout

Locked test files live outside the shared work directory and are bind-mounted read-only, so delivered code, including build scripts, cannot change them. The work directory is deleted after every run.

## Hidden tests (holdout)

A buyer can add hidden tests that the seller never sees. The backend seals them with the runner's public key, so the backend, the database and the seller can never read them. Only a runner with the matching private key can open them. There is no TEE: whoever runs the runner host can read them.

- **Scheme:** X25519 key agreement with a fresh ephemeral key, HKDF-SHA256, then AES-256-GCM. The sealed blob is JSON `{ v: 1, alg: "X25519-HKDF-SHA256-A256GCM", kid, epk, iv, tag, ct }`. The additional data binds the algorithm, the key id and the holdout hash, so a changed blob or hash fails to open.
- **Hash:** `holdoutRef` is the sha256 of the canonical plaintext set: `{ standard: "agora-holdout", version: 1, command, files: [{ path, sha256 }] }` sorted by path. The backend computes it before sealing and commits it in the spec lock and in `accept_offer`. The runner recomputes it after opening and refuses a mismatch.
- **Request:** send `holdoutRef` and `holdoutBlob` with `/run`. The hidden tests run in their own step after the build, test and baseline steps. Their output goes to a separate scratch log that is deleted after the run. The result carries only `holdoutExit` and `holdoutCounts: { passed, failed }`, and the main log gets one line with the same numbers. File names, test names and output never reach the result or the log. The decrypted files are deleted after the step.
- **Command:** the hidden tests run with the sealed command, or with `testCommand` when none is sealed. With `cargo test --no-fail-fast` the counts include the locked tests too.

Create a key pair once:

```sh
npm run holdout:keys
```

It prints two lines and writes nothing. Put `AGORA_RUNNER_HOLDOUT_PRIVATE_KEY` in `runner/.env` and `AGORA_HOLDOUT_PUBLIC_KEY` in `backend/.env`. Never commit or share the private key. Holdouts sealed with an old key cannot be opened after the key changes, so seal them again.

## J-1042 fixture

[fixtures/j1042](fixtures/j1042) is a small payroll crate whose `split_payment` loses dust. It has 31 passing tests and 2 named failing tests in `tests/split_rounding.rs`. Four deliveries are stored as files that replace the base files:

| Delivery | What it does | Expected |
| --- | --- | --- |
| `good` | Gives the remainder to the last worker | pass: 33 of 33 tests, scope ok |
| `wrong-fix` | Gives the remainder to the first worker | fail: `test_split_dust_to_last` fails |
| `out-of-scope` | Correct fix, plus a planted change in `src/fees.rs` | fail: tests pass, scope fails |
| `edits-test` | Weakens the locked test instead of fixing the bug | fail: the locked test still runs |

Two more cases seal hidden tests from [fixtures/j1042/holdout](fixtures/j1042/holdout) with the key from `/holdout-key` and run them against `good`: one set passes, and one overflows on a very large total, so the locked tests pass but the hidden checks fail. They are skipped when the runner has no holdout key.

The test script builds a git repository from these files with fixed commit hashes and sends every case to `/run`. Set `AGORA_RUNNER_DEV_REPO_DIR` to the absolute path of `.fixtures` and create the folder before you start the runner. Dev mode lets the runner clone local repositories as `file:///src/<name>`, so use it only for local testing.

```sh
mkdir -p .fixtures
npm start
npm run test:j1042
```

Unit tests for sealing run without Docker: `npm test`.

Use `cargo test --no-fail-fast` as the test command, so every test binary runs even after one fails.

## Limits

- The image ships Rust stable and `wasm32-unknown-unknown`. `cargo near build` needs `cargo-near` added to the image.
- Hidden tests are protected by the runner key only, with no TEE. A seller's code runs next to the hidden tests in the holdout step and could signal through its exit code or printed counts, but nothing else leaves the sandbox.
- The runner needs access to the Docker engine, so run it on a host or VM that is used only for running deliveries.
