import { Test } from '@nestjs/testing';
import { DemoController } from './demo.controller';

describe('DemoController', () => {
    it('serves the scripted demo the frontend tour needs', async () => {
        const module = await Test.createTestingModule({ controllers: [DemoController] }).compile();
        const demo = module.get(DemoController).getDemo();
        expect(demo.job.id).toBe('J-1042');
        expect(demo.bids.map((b) => b.key)).toEqual(expect.arrayContaining(['patchsmith', 'dana', 'rustwright', 'kofi']));
        expect(demo.held).toHaveLength(2);
        expect(demo.reviewers).toHaveLength(3);
        // every arriving offer is either a bid or a held lure, or the offers list in the tour breaks
        const known = new Set([...demo.bids.map((b) => b.key), ...demo.held.map((h) => h.name)]);
        expect(demo.arrive.every((k) => known.has(k))).toBe(true);
    });
});
