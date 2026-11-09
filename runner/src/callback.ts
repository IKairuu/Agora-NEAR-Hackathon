import { config } from './config.js';
import { RunResult } from './schema.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const postResult = async (url: string, result: RunResult): Promise<boolean> => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-internal-key': config.internalKey },
                body: JSON.stringify(result),
                signal: AbortSignal.timeout(15_000),
            });
            if (res.ok) return true;
        } catch {
            void 0;
        }
        await sleep(2000 * attempt);
    }
    return false;
};
