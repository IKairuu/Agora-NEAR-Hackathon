import { config } from './config.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const postResult = async (url, result) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-internal-key': config.internalKey },
                body: JSON.stringify(result),
                signal: AbortSignal.timeout(15_000),
            });
            if (res.ok)
                return true;
        }
        catch {
            void 0;
        }
        await sleep(2000 * attempt);
    }
    return false;
};
