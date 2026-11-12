jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { sealLimit } from '../limits';
import { AgentsRepository } from './agents.repository';
import { AgentsService, isActorOf } from './agents.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';

describe('AgentsService', () => {
    let repo: jest.Mocked<AgentsRepository>;
    let service: AgentsService;
    let fetchMock: jest.Mock;
    const env = { ...process.env };

    beforeEach(() => {
        repo = {
            getPlatformAgent: jest.fn().mockResolvedValue({ id: 'agent-1' }),
            getTeam: jest.fn().mockResolvedValue({ agentsAccountId: 'agents.lumen.testnet', mandate: null, sellers: [], agentEvents: [] }),
            getEvents: jest.fn().mockResolvedValue([]),
            getBuyerContext: jest.fn(),
            getAgentSellers: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<AgentsRepository>;
        service = new AgentsService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService);
        fetchMock = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = fetchMock as unknown as typeof fetch;
        process.env['AGORA_N8N_URL'] = 'http://n8n:5678';
        process.env['AGORA_N8N_WEBHOOK_KEY'] = 'hook-key';
        process.env['AGORA_LIMIT_KEY'] = 'b'.repeat(64);
    });

    afterEach(() => { process.env = { ...env }; });

    it('posts the n8n envelope to the flow webhook with the header key', async () => {
        await expect(service.dispatch('fraud_lure', { ownerId: USER, jobId: 'j1', payload: { subjectType: 'bid', subjectId: 'b1' } })).resolves.toMatchObject({ flow: 'fraud_lure', status: 'sent' });
        const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
        expect(url).toBe('http://n8n:5678/webhook/agora/fraud-lure');
        expect(init.headers['x-agora-key']).toBe('hook-key');
        expect(JSON.parse(init.body)).toMatchObject({ ownerId: USER, jobId: 'j1', agentId: 'agent-1', payload: { subjectType: 'bid', subjectId: 'b1' } });
        expect(JSON.parse(init.body).runId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('uses a custom header name when set', async () => {
        process.env['AGORA_N8N_WEBHOOK_HEADER'] = 'x-n8n-key';
        await service.dispatch('spec_writer', { ownerId: USER, jobId: 'j1', payload: { jobId: 'j1' } });
        expect((fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }])[1].headers['x-n8n-key']).toBe('hook-key');
    });

    it('skips when n8n is not configured and never throws when it is down', async () => {
        delete process.env['AGORA_N8N_URL'];
        await expect(service.dispatch('reviewer', { ownerId: null, jobId: 'j1', payload: {} })).resolves.toMatchObject({ status: 'skipped' });
        expect(fetchMock.mock.calls).toHaveLength(0);
        process.env['AGORA_N8N_URL'] = 'http://n8n:5678';
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        await expect(service.dispatch('reviewer', { ownerId: null, jobId: 'j1', payload: {} })).resolves.toMatchObject({ status: 'failed' });
    });

    it('starts the three reviewers on one delivery', async () => {
        await service.dispatchReviewers(USER, 'j1', 'd1');
        expect(fetchMock.mock.calls.map((c) => JSON.parse((c as [string, { body: string }])[1].body).payload)).toEqual([
            { deliveryId: 'd1', reviewer: 1 }, { deliveryId: 'd1', reviewer: 2 }, { deliveryId: 'd1', reviewer: 3 },
        ]);
    });

    it('shows the team with the latest event per agent and the pause state', async () => {
        repo.getTeam.mockResolvedValue({
            agentsAccountId: 'agents.lumen.testnet', mandate: { paused: false }, sellers: [],
            agentEvents: [{ actorLabel: 'Reviewer 2', message: 'Reviewer 2 approved: tests pass', severity: 'ok', createdAt: new Date() }],
        } as never);
        const team = await service.getAgents('Bearer t');
        expect(team).toMatchObject({ agentsAccount: 'agents.lumen.testnet', paused: false, connected: true });
        expect(team.agents.find((a) => a.role === 'reviewer')).toMatchObject({ status: 'Reviewer 2 approved: tests pass' });
        expect(team.agents.find((a) => a.role === 'bidding')).toMatchObject({ status: 'Off', keys: 'Off while you only buy' });
        repo.getTeam.mockResolvedValue({ agentsAccountId: '', mandate: { paused: true }, sellers: [{ id: 's' }], agentEvents: [] } as never);
        const paused = await service.getAgents('Bearer t');
        expect(paused.agents.find((a) => a.role === 'guardian')).toMatchObject({ status: 'Ready' });
        expect(paused.agents.find((a) => a.role === 'transaction')).toMatchObject({ status: 'Paused' });
    });

    it('refuses a malformed job filter', async () => {
        await expect(service.getEvents('Bearer t', 'nope')).rejects.toThrow('Job id is not valid');
    });

    const HIDDEN = 47.123456;
    const buyerJob = (over: object = {}) => ({ id: 'j1', buyerId: USER, status: 'open', limits: { maxPriceCiphertext: sealLimit(HIDDEN).ciphertext }, ...over });

    it('sends the hidden maximum to the buyer agent only inside the webhook envelope', async () => {
        repo.getBuyerContext.mockResolvedValue(buyerJob() as never);
        const res = await service.dispatchBuyer('j1');
        expect(res).toEqual({ flow: 'buyer', runId: expect.stringMatching(/^[0-9a-f-]{36}$/), status: 'sent' });
        const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
        expect(url).toBe('http://n8n:5678/webhook/agora/buyer');
        expect(JSON.parse(init.body)).toEqual({ runId: res.runId, ownerId: USER, jobId: 'j1', agentId: 'agent-1', payload: { jobId: 'j1', maxPrice: HIDDEN } });
        expect(JSON.stringify(res)).not.toContain('47.12');
        expect(JSON.stringify(res)).not.toContain('maxPrice');
    });

    it('never leaks the hidden maximum when the webhook fails', async () => {
        repo.getBuyerContext.mockResolvedValue(buyerJob() as never);
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        const res = await service.dispatchBuyer('j1');
        expect(res.status).toBe('failed');
        expect(JSON.stringify(res)).not.toContain('47.12');
    });

    it('skips the buyer agent with no hidden budget, a closed job or no n8n', async () => {
        repo.getBuyerContext.mockResolvedValue(buyerJob({ limits: null }) as never);
        await expect(service.dispatchBuyer('j1')).resolves.toMatchObject({ status: 'skipped' });
        repo.getBuyerContext.mockResolvedValue(buyerJob({ status: 'agreed' }) as never);
        await expect(service.dispatchBuyer('j1')).resolves.toMatchObject({ status: 'skipped' });
        delete process.env['AGORA_N8N_URL'];
        await expect(service.dispatchBuyer('j1')).resolves.toMatchObject({ status: 'skipped' });
        expect(fetchMock.mock.calls).toHaveLength(0);
        expect(repo.getBuyerContext.mock.calls).toHaveLength(2);
    });

    it('fails without detail when the hidden budget cannot be opened', async () => {
        repo.getBuyerContext.mockResolvedValue(buyerJob({ limits: { maxPriceCiphertext: 'garbage' } }) as never);
        await expect(service.dispatchBuyer('j1')).resolves.toMatchObject({ status: 'failed' });
        repo.getBuyerContext.mockRejectedValue(new Error('db down'));
        await expect(service.dispatchBuyer('j1')).resolves.toMatchObject({ status: 'failed' });
        expect(fetchMock.mock.calls).toHaveLength(0);
    });

    it('starts each matching agent seller with its own agent id', async () => {
        repo.getAgentSellers.mockResolvedValue([{ id: 's1', ownerId: 'o1', agentId: 'a1' }, { id: 's2', ownerId: 'o2', agentId: null }] as never);
        const res = await service.dispatchBidders('j1');
        expect(res.map((r) => r.status)).toEqual(['sent', 'sent']);
        expect(repo.getAgentSellers.mock.calls[0]).toEqual(['j1', 20]);
        expect(fetchMock.mock.calls.map((c) => (c as [string, unknown])[0])).toEqual(['http://n8n:5678/webhook/agora/bidding', 'http://n8n:5678/webhook/agora/bidding']);
        const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as [string, { body: string }])[1].body));
        expect(bodies[0]).toMatchObject({ ownerId: 'o1', jobId: 'j1', agentId: 'a1', payload: { jobId: 'j1', sellerId: 's1', action: 'bid' } });
        expect(bodies[1]).toMatchObject({ ownerId: 'o2', agentId: 'agent-1', payload: { sellerId: 's2', action: 'bid' } });
    });

    it('never fails a publish when bidders cannot be loaded or n8n is off', async () => {
        repo.getAgentSellers.mockRejectedValue(new Error('db down'));
        await expect(service.dispatchBidders('j1')).resolves.toEqual([]);
        delete process.env['AGORA_N8N_URL'];
        await expect(service.dispatchBidders('j1')).resolves.toEqual([]);
    });

    it('sends a negotiate action to a seller bidding agent', async () => {
        await service.dispatchBidding({ id: 's1', ownerId: 'o1', agentId: 'a1' }, 'j1', 'negotiate');
        expect(JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)).toMatchObject({ agentId: 'a1', payload: { jobId: 'j1', sellerId: 's1', action: 'negotiate' } });
    });

    it('shows the latest buyer, bidding and guardian events on the team', async () => {
        repo.getTeam.mockResolvedValue({
            agentsAccountId: 'agents.lumen.testnet', mandate: { paused: false }, sellers: [{ id: 's' }],
            agentEvents: [
                { actorLabel: 'patchbot (bidding)', message: 'patchbot bid 36 USDC, 2 day(s), 1 milestone(s)', severity: 'ok', createdAt: new Date() },
                { actorLabel: 'Buyer agent', message: 'Countered patchbot at 30 USDC (round 1 of 3)', severity: 'info', createdAt: new Date() },
                { actorLabel: 'Guardian', message: 'Paused your agents', severity: 'block', createdAt: new Date() },
            ],
        } as never);
        const team = await service.getAgents('Bearer t');
        expect(team.agents).toHaveLength(7);
        expect(team.agents.find((a) => a.role === 'bidding')).toMatchObject({ status: 'patchbot bid 36 USDC, 2 day(s), 1 milestone(s)' });
        expect(team.agents.find((a) => a.role === 'buyer')).toMatchObject({ status: 'Countered patchbot at 30 USDC (round 1 of 3)' });
        expect(team.agents.find((a) => a.role === 'guardian')).toMatchObject({ status: 'Paused your agents', severity: 'block' });
        expect(isActorOf('buyer', 'Buyer agent', 'patchbot (bidding)')).toBe(false);
    });
});
