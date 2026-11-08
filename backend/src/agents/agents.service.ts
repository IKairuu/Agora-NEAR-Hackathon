import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { AuthService } from '../auth/auth.service.js';
import { AgentsRepository, JobKey } from './agents.repository.js';

export type AgentFlow = 'spec_writer' | 'fraud_lure' | 'price_check' | 'reviewer' | 'buyer' | 'bidding';

const PATHS: Record<AgentFlow, string> = {
    spec_writer: 'spec-writer',
    fraud_lure: 'fraud-lure',
    price_check: 'price-check',
    reviewer: 'review',
    buyer: 'buyer',
    bidding: 'bidding',
};

export interface Dispatch {
    ownerId: string | null;
    jobId: string | null;
    payload: Record<string, unknown>;
}

export type DispatchResult = { flow: AgentFlow; runId: string; status: 'sent' | 'skipped' | 'failed' };

const TEAM = [
    { role: 'spec_writer', name: 'Spec writer', keys: 'No key, advises', money: false, actor: 'Spec writer' },
    { role: 'buyer', name: 'Buyer agent', keys: 'No key, advises', money: false, actor: 'Buyer agent' },
    { role: 'transaction', name: 'Transaction agent', keys: 'Function-call key, 6 methods, cannot withdraw', money: true, actor: 'Transaction agent' },
    { role: 'reviewer', name: 'Reviewers, 3', keys: 'Vote only, shared', money: false, actor: 'Reviewer' },
    { role: 'fraud_lure', name: 'Fraud and lure', keys: 'Can hold, not pay, shared', money: false, actor: 'Fraud' },
    { role: 'guardian', name: 'Guardian', keys: 'Function-call key, pause only', money: false, actor: 'Guardian' },
    { role: 'bidding', name: 'Bidding agent', keys: 'Function-call key, bid and deliver', money: false, actor: 'Bidding' },
];

@Injectable()
export class AgentsService {
    constructor(
        private readonly agentsRepository: AgentsRepository,
        private readonly authService: AuthService,
    ) {}

    async dispatch(flow: AgentFlow, d: Dispatch): Promise<DispatchResult> {
        const runId = randomUUID();
        const base = process.env['AGORA_N8N_URL'];
        const key = process.env['AGORA_N8N_WEBHOOK_KEY'];
        if (!base || !key) return { flow, runId, status: 'skipped' };
        try {
            const agent = await this.agentsRepository.getPlatformAgent(flow);
            const res = await fetch(`${base}/webhook/agora/${PATHS[flow]}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', [process.env['AGORA_N8N_WEBHOOK_HEADER'] ?? 'x-agora-key']: key },
                body: JSON.stringify({ runId, ownerId: d.ownerId, jobId: d.jobId, agentId: agent?.id ?? null, payload: d.payload }),
                signal: AbortSignal.timeout(5_000),
            });
            return { flow, runId, status: res.ok ? 'sent' : 'failed' };
        } catch {
            return { flow, runId, status: 'failed' };
        }
    }

    async dispatchReviewers(ownerId: string | null, jobId: string, deliveryId: string): Promise<DispatchResult[]> {
        return Promise.all([1, 2, 3].map((reviewer) => this.dispatch('reviewer', { ownerId, jobId, payload: { deliveryId, reviewer } })));
    }

    async getAgents(token: string) {
        const authId = await this.authId(token);
        const row = await this.agentsRepository.getTeam(authId);
        const events = row?.agentEvents ?? [];
        const seller = (row?.sellers.length ?? 0) > 0;
        const paused = row?.mandate?.paused ?? false;
        return {
            agentsAccount: row?.agentsAccountId ?? '',
            paused,
            connected: Boolean(process.env['AGORA_N8N_URL'] && process.env['AGORA_N8N_WEBHOOK_KEY']),
            agents: TEAM.map((a) => {
                const last = events.find((e) => e.actorLabel.toLowerCase().startsWith(a.actor.toLowerCase()));
                const off = a.role === 'bidding' && !seller;
                return {
                    role: a.role,
                    name: a.name,
                    keys: off ? 'Off while you only buy' : a.keys,
                    money: a.money,
                    status: paused && a.role !== 'guardian' ? 'Paused' : off ? 'Off' : last?.message ?? 'Ready',
                    severity: last?.severity ?? null,
                    at: last?.createdAt ?? null,
                };
            }),
        };
    }

    async getEvents(token: string, job: string | undefined) {
        const authId = await this.authId(token);
        const rows = await this.agentsRepository.getEvents(authId, job ? this.jobKey(job) : null);
        return {
            items: rows.map((e) => ({ id: e.id.toString(), actor: e.actorLabel, message: e.message, severity: e.severity, job: e.job?.ref ?? null, data: e.data, at: e.createdAt })),
        };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job)) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }
}
