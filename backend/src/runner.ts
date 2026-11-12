export interface RunTestFile {
    path: string;
    content: string;
}

export interface RunJob {
    repoUrl: string;
    commit: string;
    baseCommit: string;
    testCommand: string;
    buildCommand: string | null;
    testFiles: RunTestFile[];
    allowedPaths: string[];
    failingTests: string[];
    runId: string;
    deliveryId: string;
    holdoutRef?: string;
    holdoutBlob?: string;
}

export const testFilesOf = (value: unknown): RunTestFile[] =>
    Array.isArray(value) ? (value as RunTestFile[]).filter((f) => typeof f?.path === 'string' && typeof f?.content === 'string') : [];

export const dispatchRun = async (job: RunJob): Promise<'queued' | 'unavailable'> => {
    const url = process.env['AGORA_RUNNER_URL'];
    const key = process.env['AGORA_RUNNER_KEY'];
    if (!url || !key) return 'unavailable';
    const api = process.env['AGORA_NEST_URL'] ?? `http://localhost:${process.env['PORT'] ?? '3000'}/api`;
    try {
        const res = await fetch(`${url}/run`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-runner-key': key },
            body: JSON.stringify({ ...job, baseline: true, callbackUrl: `${api}/internal/v1/runner/result` }),
            signal: AbortSignal.timeout(10_000),
        });
        return res.ok ? 'queued' : 'unavailable';
    } catch {
        return 'unavailable';
    }
};
