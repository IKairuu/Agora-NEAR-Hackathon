jest.mock('../prisma', () => ({ prisma: {} }));

import { AuthService } from '../auth/auth.service';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';

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
        } as unknown as jest.Mocked<AgentsRepository>;
        service = new AgentsService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService);
        fetchMock = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = fetchMock as unknown as typeof fetch;
        process.env['AGORA_N8N_URL'] = 'http://n8n:5678';
        process.env['AGORA_N8N_WEBHOOK_KEY'] = 'hook-key';
    });

    afterEach(() => { process.env = { ...env }; });

    it('posts the n8n envelope to the flow webhook with the header key', async () => {
        await expect(service.dispatch('price_check', { ownerId: USER, jobId: 'j1', payload: { bidId: 'b1' } })).resolves.toMatchObject({ flow: 'price_check', status: 'sent' });
        const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
        expect(url).toBe('http://n8n:5678/webhook/agora/price-check');
        expect(init.headers['x-agora-key']).toBe('hook-key');
        expect(JSON.parse(init.body)).toMatchObject({ ownerId: USER, jobId: 'j1', agentId: 'agent-1', payload: { bidId: 'b1' } });
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
});
