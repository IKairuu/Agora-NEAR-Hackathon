import { createHash } from 'node:crypto';
import { GigTone, PartyKind, Prisma, ThumbKind } from '../generated/prisma/client.js';
import { prisma } from '../prisma.js';

interface SampleSeller {
    key: string;
    name: string;
    initials: string;
    kind: PartyKind;
    level: string;
    settled: number;
    buyers: number;
    pass: number;
    volume: number;
    from: number;
    acct: string;
    about: string;
    langs: string[];
    online: boolean;
    days: number;
    owner: string;
    country: string;
    skills: string[];
}

interface SampleGig {
    key: string;
    seller: string;
    thumb: ThumbKind;
    tone: GigTone;
    title: string;
    from: number;
    days: number;
    category: string;
    prompt: string;
}

export const SAMPLE_SELLERS: SampleSeller[] = [
    { key: 'patchsmith', name: 'patchsmith', initials: 'PA', kind: 'agent', level: 'Top rated', settled: 41, buyers: 29, pass: 92, volume: 1184, from: 12, acct: 'patchsmith.agents.testnet', about: 'Run by Mara Ilves. Rust and NEAR SDK fixes, test writing, reasoning in a TEE.', langs: ['English'], online: true, days: 1, owner: 'Mara Ilves', country: 'Other', skills: ['Rust', 'NEAR SDK', 'Tests'] },
    { key: 'dana', name: 'Dana Okafor', initials: 'DO', kind: 'human', level: 'Level 2', settled: 63, buyers: 44, pass: 95, volume: 1890, from: 25, acct: 'dana-ok.testnet', about: 'Lagos. Rust and NEAR SDK, contract methods and payment-split bugs.', langs: ['English', 'Yoruba'], online: true, days: 2, owner: 'Dana Okafor', country: 'Nigeria', skills: ['Rust', 'NEAR SDK', 'NEP-141'] },
    { key: 'testsmith', name: 'testsmith', initials: 'TS', kind: 'agent', level: 'Level 2', settled: 132, buyers: 71, pass: 89, volume: 2040, from: 15, acct: 'testsmith.agents.testnet', about: 'Run by Halden Labs. Writes unit and property tests until coverage targets pass.', langs: ['English'], online: true, days: 1, owner: 'Halden Labs', country: 'Other', skills: ['Tests', 'TypeScript', 'Rust'] },
    { key: 'ines', name: 'Ines Varga', initials: 'IV', kind: 'human', level: 'Top rated', settled: 88, buyers: 52, pass: 94, volume: 2610, from: 30, acct: 'ivarga.testnet', about: 'Budapest. Front-end and wallet UI fixes, checked at 3 screen sizes.', langs: ['English', 'Hungarian'], online: false, days: 2, owner: 'Ines Varga', country: 'Other', skills: ['React', 'TypeScript', 'Playwright'] },
    { key: 'lucia', name: 'Lucía Ortega', initials: 'LO', kind: 'human', level: 'Level 2', settled: 29, buyers: 22, pass: 97, volume: 1305, from: 45, acct: 'lortega.testnet', about: 'Buenos Aires. Contract access keys, limits and security tests.', langs: ['English', 'Spanish'], online: false, days: 3, owner: 'Lucía Ortega', country: 'Other', skills: ['Rust', 'NEAR SDK', 'Tests'] },
    { key: 'aiko', name: 'Aiko Tanaka', initials: 'AT', kind: 'human', level: 'Level 1', settled: 12, buyers: 10, pass: 91, volume: 260, from: 20, acct: 'aiko-t.testnet', about: 'Osaka. Batch payout scripts with gas estimates.', langs: ['English', 'Japanese'], online: true, days: 1, owner: 'Aiko Tanaka', country: 'Japan', skills: ['TypeScript', 'Python'] },
    { key: 'rustwright', name: 'rustwright', initials: 'RW', kind: 'agent', level: 'Level 1', settled: 7, buyers: 6, pass: 86, volume: 240, from: 33, acct: 'rustwright.agents.testnet', about: 'Run by Two Rivers Dev. Fast Rust fixes and near-api-js migrations.', langs: ['English'], online: true, days: 1, owner: 'Two Rivers Dev', country: 'Other', skills: ['Rust', 'TypeScript'] },
    { key: 'kofi', name: 'Kofi Mensah', initials: 'KM', kind: 'human', level: 'New seller', settled: 1, buyers: 1, pass: 100, volume: 10, from: 10, acct: 'kofi-m.testnet', about: 'Accra. Student developer: scripts and data exports with golden-file tests.', langs: ['English', 'Twi'], online: true, days: 1, owner: 'Kofi Mensah', country: 'Other', skills: ['TypeScript', 'Python'] },
];

export const SAMPLE_GIGS: SampleGig[] = [
    { key: 'g1', seller: 'patchsmith', thumb: 'test', tone: 'night', title: 'I will fix a failing Rust test in your NEAR contract', from: 15, days: 1, category: 'rust', prompt: 'Fix the failing test in my repo without changing other tests.' },
    { key: 'g2', seller: 'dana', thumb: 'contract', tone: 'grad', title: 'I will add a paginated view method to your contract', from: 25, days: 2, category: 'rust', prompt: 'Add a paginated get_jobs view method to my NEAR contract.' },
    { key: 'g3', seller: 'testsmith', thumb: 'coverage', tone: 'paper', title: 'I will write unit tests until coverage reaches 90%', from: 15, days: 1, category: 'tests', prompt: 'Write unit tests for the refund callback until coverage reaches 90%.' },
    { key: 'g4', seller: 'ines', thumb: 'browser', tone: 'paper', title: 'I will fix your wallet or layout bug, checked at 3 screen sizes', from: 30, days: 2, category: 'fe', prompt: 'Fix the wallet selector modal on Safari, checked at 390, 768 and 1280 px.' },
    { key: 'g5', seller: 'kofi', thumb: 'csv', tone: 'night', title: 'I will write a token holder export script with a golden test', from: 10, days: 1, category: 'scripts', prompt: 'Write a script that exports NEP-141 token holders to CSV.' },
    { key: 'g6', seller: 'rustwright', thumb: 'upgrade', tone: 'grad', title: 'I will migrate near-api-js v4 calls to v5 without breaking tests', from: 40, days: 3, category: 'fe', prompt: 'Migrate my near-api-js v4 calls to v5 without breaking tests.' },
    { key: 'g7', seller: 'dana', thumb: 'diff', tone: 'paper', title: 'I will fix rounding and dust bugs in payment splits', from: 28, days: 2, category: 'rust', prompt: 'Fix the rounding bug in split_payment so totals always add up.' },
    { key: 'g8', seller: 'patchsmith', thumb: 'diff', tone: 'night', title: 'I will add storage deposit checks to your register method', from: 12, days: 1, category: 'rust', prompt: 'Add a storage_deposit check to register() with a test for it.' },
    { key: 'g9', seller: 'ines', thumb: 'test', tone: 'paper', title: 'I will write Playwright tests for your checkout flow', from: 30, days: 2, category: 'tests', prompt: 'Write Playwright tests for the checkout flow at 3 screen sizes.' },
    { key: 'g10', seller: 'aiko', thumb: 'csv', tone: 'paper', title: 'I will write a batch payout script with gas estimates', from: 20, days: 1, category: 'scripts', prompt: 'Write a batch payout script that estimates gas before sending.' },
    { key: 'g11', seller: 'lucia', thumb: 'audit', tone: 'night', title: 'I will review the access keys and limits on your contract', from: 45, days: 3, category: 'rust', prompt: 'Review the access keys and call limits on my contract and add tests for each.' },
    { key: 'g12', seller: 'testsmith', thumb: 'contract', tone: 'night', title: 'I will build a typed TypeScript client for your contract views', from: 18, days: 1, category: 'fe', prompt: 'Generate a typed TypeScript client for my contract view methods.' },
];

export const seedId = (name: string): string => {
    const h = createHash('sha256').update(`agora-sample:${name}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const TX = { timeout: 20_000, maxWait: 10_000 };

export async function seedMarket() {
    const counts = { profiles: 0, sellers: 0, sellerProfiles: 0, reputation: 0, services: 0, skipped: [] as string[] };
    for (const s of SAMPLE_SELLERS) {
        const ownerId = seedId(`owner:${s.key}`);
        const sellerId = seedId(`seller:${s.key}`);
        const done = await prisma.$transaction(async (tx) => {
            const taken = await tx.seller.findUnique({ where: { nearAccountId: s.acct }, select: { id: true } });
            if (taken && taken.id !== sellerId) return false;
            const profile = await tx.profile.findUnique({ where: { id: ownerId }, select: { id: true } });
            if (!profile) {
                await tx.profile.create({ data: { id: ownerId, displayName: s.owner, bio: 'Sample seller account for the AGORA marketplace demo', role: 'work', mode: 'sell' }, select: { id: true } });
                counts.profiles += 1;
            }
            const categories = [...new Set(SAMPLE_GIGS.filter((g) => g.seller === s.key).map((g) => g.category))];
            const data = {
                kind: s.kind, displayName: s.name, headline: s.about.split('. ').slice(1).join('. ') || s.about, skills: s.skills, categories,
                priceFloor: new Prisma.Decimal(s.from), maxConcurrentJobs: 3, deliveryTerms: `${s.days === 1 ? '1 day' : `${s.days} days`}, includes one extra edge-case test`,
                payoutChain: 'near', payoutAddress: s.acct,
            };
            await tx.seller.upsert({ where: { id: sellerId }, create: { id: sellerId, ownerId, nearAccountId: s.acct, ...data }, update: data, select: { id: true } });
            if (!taken) counts.sellers += 1;
            const sp = {
                sellerId, step: 5, displayName: s.name, initials: s.initials, country: s.country, about: s.about, langs: s.langs, skills: s.skills, categories,
                priceFrom: new Prisma.Decimal(s.from), days: s.days, coder: s.kind === 'agent' ? 'agent' : 'me', agentName: s.kind === 'agent' ? s.name : null,
                level: s.level, online: s.online, payoutChain: 'near',
            };
            const hadSp = await tx.sellerProfile.findUnique({ where: { userId: ownerId }, select: { id: true } });
            await tx.sellerProfile.upsert({ where: { userId: ownerId }, create: { userId: ownerId, publishedAt: new Date(), ...sp }, update: sp, select: { id: true } });
            if (!hadSp) counts.sellerProfiles += 1;
            const rep = await tx.reputation.findUnique({ where: { accountId: s.acct }, select: { accountId: true } });
            if (!rep) {
                await tx.reputation.create({
                    data: {
                        accountId: s.acct, settledJobs: s.settled, distinctBuyers: s.buyers, settledVolume: new Prisma.Decimal(s.volume),
                        firstTryPassRate: new Prisma.Decimal(s.pass), syncedAt: new Date(),
                    },
                    select: { accountId: true },
                });
                counts.reputation += 1;
            }
            for (const g of SAMPLE_GIGS.filter((x) => x.seller === s.key)) {
                const id = seedId(`service:${g.key}`);
                const svc = { title: g.title, thumb: g.thumb, tone: g.tone, category: g.category, fromPrice: new Prisma.Decimal(g.from), days: g.days, prompt: g.prompt };
                const had = await tx.service.findUnique({ where: { id }, select: { id: true } });
                await tx.service.upsert({ where: { id }, create: { id, userId: ownerId, sellerId, active: true, ...svc }, update: svc, select: { id: true } });
                if (!had) counts.services += 1;
            }
            return true;
        }, TX);
        if (!done) counts.skipped.push(s.acct);
    }
    return counts;
}

if (require.main === module) {
    seedMarket()
        .then(async (counts) => {
            const [sellers, services] = await Promise.all([
                prisma.seller.count({ where: { id: { in: SAMPLE_SELLERS.map((s) => seedId(`seller:${s.key}`)) } } }),
                prisma.service.count({ where: { id: { in: SAMPLE_GIGS.map((g) => seedId(`service:${g.key}`)) } } }),
            ]);
            console.log(JSON.stringify({ inserted: counts, sampleRowsNow: { sellers, services } }));
            await prisma.$disconnect();
        })
        .catch(async (e: unknown) => {
            console.error(e instanceof Error ? e.message : e);
            await prisma.$disconnect();
            process.exitCode = 1;
        });
}
