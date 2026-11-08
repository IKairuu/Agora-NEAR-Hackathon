import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { IndexerRepository, JobRef } from './indexer.repository.js';

export const MOCK_START_BALANCE = 120;
const FUND_METHODS = ['fund_job'];
const REFUND_METHODS = ['refund_milestone', 'refund_expired'];

export const jobRefOf = (value: unknown): JobRef | null => {
    const v = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    if (typeof v !== 'string') return null;
    if (/^\d{1,19}$/.test(v)) return { onchainId: BigInt(v) };
    if (/^J-\d+$/.test(v)) return { ref: v };
    if (/^[0-9a-f-]{36}$/i.test(v)) return { id: v };
    return null;
};

export interface MockCall {
    signer: string;
    method: string;
    args: Record<string, unknown>;
    txHash: string;
}

@Injectable()
export class IndexerService {
    constructor(private readonly indexerRepository: IndexerRepository) {}

    async onMockCall(call: MockCall) {
        const jobKey = jobRefOf(call.args['job_id']);
        await this.indexerRepository.recordTx({
            txHash: call.txHash, signer: call.signer, method: call.method, args: call.args as Prisma.InputJsonValue, ok: true, error: null, jobKey,
        });
        if (!jobKey) return null;
        if (FUND_METHODS.includes(call.method)) return this.indexerRepository.fundJob(jobKey, call.txHash, MOCK_START_BALANCE);
        if (REFUND_METHODS.includes(call.method)) return this.indexerRepository.refundJob(jobKey, call.txHash);
        return null;
    }

    async onMockRelease(jobId: string, txHash: string) {
        const fee = Number(process.env['AGORA_FEE_BPS'] ?? '200');
        const dao = process.env['AGORA_DAO_ACCOUNT'] ?? 'agora-dao.sputnikv2.testnet';
        await this.indexerRepository.recordTx({
            txHash, signer: 'reviewers', method: 'vote', args: { job_id: jobId, approve: true }, ok: true, error: null, jobKey: { id: jobId },
        });
        return this.indexerRepository.releaseJob({ id: jobId }, txHash, fee, dao);
    }
}
