jest.mock('../prisma', () => ({ prisma: {} }));

import { isUUID } from 'class-validator';
import { SAMPLE_GIGS, SAMPLE_SELLERS, seedId } from './seed-market';

describe('seed-market sample data', () => {
    it('uses stable valid ids so a second run updates the same rows', () => {
        expect(seedId('seller:dana')).toBe(seedId('seller:dana'));
        expect(seedId('seller:dana')).not.toBe(seedId('seller:kofi'));
        expect(isUUID(seedId('service:g1'))).toBe(true);
    });

    it('matches the frontend sample directory and services', () => {
        expect(SAMPLE_SELLERS).toHaveLength(8);
        expect(SAMPLE_GIGS).toHaveLength(12);
        const keys = SAMPLE_SELLERS.map((s) => s.key);
        expect(SAMPLE_GIGS.every((g) => keys.includes(g.seller))).toBe(true);
        expect(SAMPLE_GIGS.every((g) => ['rust', 'fe', 'tests', 'scripts'].includes(g.category))).toBe(true);
        expect(new Set(SAMPLE_SELLERS.map((s) => s.acct)).size).toBe(8);
    });
});
