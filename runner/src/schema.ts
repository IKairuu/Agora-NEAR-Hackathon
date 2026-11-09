import { z } from 'zod';

const sha = z.string().regex(/^[0-9a-fA-F]{7,40}$/, 'must be a git commit hash');
const ref = z.string().regex(/^(?!-)[A-Za-z0-9._/-]{1,200}$/, 'must be a commit hash or branch name');
const relPath = z.string().regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[\w./-]{1,300}$/, 'must be a path inside the repo');

export const testFileSchema = z.object({
    path: relPath,
    content: z.string().max(200_000),
});

export const runRequestSchema = z.object({
    repoUrl: z.string().min(1).max(500),
    commit: sha,
    baseCommit: ref,
    testCommand: z.string().min(1).max(1000),
    buildCommand: z.string().max(1000).nullish(),
    testFiles: z.array(testFileSchema).max(50).nullish(),
    runId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).nullish(),
    deliveryId: z.string().max(64).nullish(),
    allowedPaths: z.array(z.string().min(1).max(300)).max(100).nullish(),
    failingTests: z.array(z.string().max(300)).max(100).nullish(),
    baseline: z.boolean().nullish(),
    holdoutRef: z.string().regex(/^[0-9a-f]{64}$/, 'must be a sha256 hex hash').nullish(),
    holdoutBlob: z.string().max(4_000_000).nullish(),
    timeoutSec: z.number().int().positive().nullish(),
    callbackUrl: z.string().url().nullish(),
}).refine((r) => !r.holdoutBlob || !!r.holdoutRef, { message: 'holdoutRef is required with holdoutBlob', path: ['holdoutRef'] });

export type RunRequest = z.infer<typeof runRequestSchema>;

export const runErrorSchema = z.enum(['clone_failed', 'bad_commit', 'timeout', 'docker_failed', 'internal']);
export type RunError = z.infer<typeof runErrorSchema>;

export const stepSchema = z.object({
    name: z.string(),
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int(),
});
export type Step = z.infer<typeof stepSchema>;

export const runResultSchema = z.object({
    runId: z.string(),
    deliveryId: z.string().nullable(),
    error: runErrorSchema.nullable(),
    exitCode: z.number().int().nullable(),
    installExit: z.number().int().nullable(),
    baselineExitCode: z.number().int().nullable(),
    changedFiles: z.array(z.string()),
    scopeOk: z.boolean().nullable(),
    diffStats: z.object({ files: z.number().int(), insertions: z.number().int(), deletions: z.number().int() }),
    diffText: z.string(),
    logTail: z.string(),
    logSha256: z.string(),
    logPath: z.string(),
    durationMs: z.number().int(),
    timedOut: z.boolean(),
    holdoutExit: z.number().int().nullable(),
    holdoutCounts: z.object({ passed: z.number().int(), failed: z.number().int() }).nullable(),
    failingTests: z.array(z.string()),
    image: z.string(),
    steps: z.array(stepSchema),
});

export type RunResult = z.infer<typeof runResultSchema>;
