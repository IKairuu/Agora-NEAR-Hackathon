export const createLimiter = (max: number) => {
    let active = 0;
    const waiting: (() => void)[] = [];
    const release = () => {
        active -= 1;
        const next = waiting.shift();
        if (next) next();
    };
    return async <T>(task: () => Promise<T>): Promise<T> => {
        if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
        active += 1;
        try {
            return await task();
        } finally {
            release();
        }
    };
};
