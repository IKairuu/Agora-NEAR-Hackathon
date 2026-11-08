import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { postResult } from './callback.js';
import { config } from './config.js';
import { createLimiter } from './queue.js';
import { checkRepoUrl, executeRun } from './run.js';
import { runRequestSchema } from './schema.js';

const limit = createLimiter(config.maxParallel);

const keyMatches = (given: string | undefined): boolean => {
    if (!given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(config.runnerKey);
    return a.length === b.length && timingSafeEqual(a, b);
};

const requireKey = (req: Request, res: Response, next: NextFunction) => {
    if (!keyMatches(req.header('x-runner-key'))) {
        res.status(401).json({ message: 'Invalid runner key' });
        return;
    }
    next();
};

export const createServer = () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '12mb' }));

    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });

    app.post('/run', requireKey, async (req, res) => {
        const parsed = runRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid run request', issues: parsed.error.issues });
            return;
        }
        const repoProblem = checkRepoUrl(parsed.data.repoUrl);
        if (repoProblem) {
            res.status(400).json({ message: repoProblem });
            return;
        }
        const body = { ...parsed.data, runId: parsed.data.runId ?? crypto.randomUUID() };
        if (body.callbackUrl) {
            const callbackUrl = body.callbackUrl;
            res.status(202).json({ runId: body.runId });
            void limit(() => executeRun(body)).then((result) => postResult(callbackUrl, result));
            return;
        }
        res.json(await limit(() => executeRun(body)));
    });

    app.get('/logs/:runId', requireKey, async (req, res) => {
        const runId = String(req.params['runId']);
        if (!/^[A-Za-z0-9-]{8,64}$/.test(runId)) {
            res.status(400).json({ message: 'Invalid run id' });
            return;
        }
        const file = path.join(config.logDir, `${runId}.log`);
        try {
            await stat(file);
        } catch {
            res.status(404).json({ message: 'Log not found' });
            return;
        }
        res.type('text/plain');
        createReadStream(file).pipe(res);
    });

    return app;
};
