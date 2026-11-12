import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { AgentsService } from '../agents/agents.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ChainService } from '../chain/chain.service.js';
import { bondNeeded, claimOf, ESCALATION_WINDOW_MS } from '../indexer/indexer.service.js';
import { holdoutRunOf } from '../holdout.js';
import { dispatchRun, testFilesOf } from '../runner.js';
import { CreateDispute } from './dto/CreateDispute.dto.js';
import { EscalateDispute } from './dto/EscalateDispute.dto.js';
import { RuleDispute } from './dto/RuleDispute.dto.js';
import { DisputeJob, DisputeNote, DisputesRepository, JobKey } from './disputes.repository.js';

type Side = 'buyer' | 'seller';

const units = (amount: number): string => String(Math.round(amount * 1_000_000));
const num = (v: { toString(): string } | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const chainJobId = (job: Pick<DisputeJob, 'onchainId' | 'ref'>): string => job.onchainId?.toString() ?? job.ref;
const daoAccount = (): string => process.env['AGORA_DAO_ACCOUNT'] ?? 'agora-dao.sputnikv2.testnet';

export const toDisputeView = (job: DisputeJob, authId: string, now: number) => {
    const milestone = job.milestones[0];
    const d = milestone?.disputes[0] ?? null;
    const role: Side = job.buyerId === authId ? 'buyer' : 'seller';
    const sideOf = (profileId: string | null): Side | null => (profileId === null ? null : profileId === job.buyerId ? 'buyer' : 'seller');
    const price = num(job.agreedPrice ?? milestone?.amount) ?? 0;
    const recheckDeadline = d?.recheckAt ? new Date(d.recheckAt.getTime() + ESCALATION_WINDOW_MS) : null;
    const escalationDeadline = d?.escalatedAt ? new Date(d.escalatedAt.getTime() + ESCALATION_WINDOW_MS) : null;
    const finalizeAfter = escalationDeadline ?? (d?.escalatedAt ? null : recheckDeadline);
    const open = d !== null && ['recheck', 'escalated'].includes(d.status);
    return {
        id: d?.id ?? null,
        job: job.ref,
        title: job.title,
        role,
        price,
        buyer: job.buyer.nearAccountId ?? job.buyer.displayName,
        seller: job.seller?.nearAccountId ?? null,
        status: d?.status ?? 'none',
        reason: d?.reason ?? null,
        openedBy: d ? sideOf(d.openedBy) : null,
        openedAt: d?.openedAt ?? null,
        canOpen: d === null && milestone?.deliveries[0] !== undefined && ['delivered', 'reviewed', 'in_progress', 'funded'].includes(job.status),
        recheck: d ? { outcome: d.recheckOutcome, at: d.recheckAt, deadline: recheckDeadline } : null,
        escalation: d?.escalatedAt ? {
            by: sideOf(d.escalatedBy), account: d.escalatorAccount, claim: d.claim, bond: num(d.bondAmount), bondTx: d.bondTx,
            proposalId: d.daoProposalId?.toString() ?? null, at: d.escalatedAt, deadline: escalationDeadline,
        } : null,
        resolution: d?.status === 'resolved' ? {
            ruling: d.ruling, sellerAmount: num(d.sellerAmount), buyerAmount: num(d.buyerAmount), sellerShareBps: d.sellerShareBps,
            by: d.resolvedBy, bondReturned: d.bondReturned, tx: d.resolveTx, at: d.resolvedAt,
        } : null,
        bondNeeded: bondNeeded(price),
        canEscalate: open && d.status === 'recheck' && d.recheckOutcome !== null && recheckDeadline !== null && now < recheckDeadline.getTime() && d.recheckOutcome !== claimOf(role),
        canFinalize: open && d.recheckOutcome !== null && finalizeAfter !== null && now >= finalizeAfter.getTime(),
        finalizeAfter,
        evidence: `/api/reviews/v1/evidence?job=${job.ref}`,
        daoAccount: daoAccount(),
    };
};

@Injectable()
export class DisputesService {
    now: () => number = () => Date.now();

    constructor(
        private readonly disputesRepository: DisputesRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
        private readonly agentsService: AgentsService,
    ) {}

    async createDispute(token: string, body: CreateDispute) {
        const authId = await this.authId(token);
        const key = this.jobKey(body.job_id);
        const job = await this.disputesRepository.getDisputeJob(authId, key);
        if (!job) throw new NotFoundException('Job not found');
        if (job.milestones[0]?.disputes[0]) throw new ConflictException('This job already has a dispute');
        const side: Side = job.buyerId === authId ? 'buyer' : 'seller';
        const account = this.accountOf(job, side);
        const reason = body.reason.trim();
        if (!reason) throw new BadRequestException('Reason is required');
        const tx = await this.chainService.callAs('owner', account, 'open_dispute', { job_id: chainJobId(job), reason });

        const fresh = (await this.disputesRepository.getDisputeJob(authId, key)) ?? job;
        const dispute = fresh.milestones[0]?.disputes[0] ?? null;
        const delivery = fresh.milestones[0]?.deliveries[0];
        const spec = fresh.acceptanceSpecs[0];
        let round: number | null = null;
        let runner = 'skipped';
        let reviewers = 0;
        if (delivery) {
            round = (delivery.reviewRuns[0]?.round ?? 0) + 1;
            const runId = randomUUID();
            const userIds = [job.buyerId, ...(job.seller ? [job.seller.ownerId] : [])];
            await this.disputesRepository.startRecheck({ deliveryId: delivery.id, round, runId, userIds, ref: job.ref, reason });
            if (spec) {
                const holdout = await this.disputesRepository.getRunHoldout(job.id);
                runner = await dispatchRun({
                    repoUrl: delivery.repoUrl,
                    commit: delivery.commitSha,
                    baseCommit: job.baseCommit ?? 'main',
                    testCommand: spec.testCommand,
                    buildCommand: spec.buildCommand,
                    testFiles: testFilesOf(spec.testFiles),
                    allowedPaths: spec.allowedPaths,
                    failingTests: spec.failingTests,
                    ...holdoutRunOf(holdout ?? { holdoutHash: null }),
                    runId,
                    deliveryId: delivery.id,
                });
            }
            await this.disputesRepository.setRunStatus(runId, runner === 'queued' ? 'running' : 'failed', runner === 'queued' ? null : runner === 'skipped' ? 'This job has no locked spec' : 'Runner unavailable');
            const sent = await this.agentsService.dispatchReviewers(job.buyerId, job.id, delivery.id);
            reviewers = sent.filter((r) => r.status === 'sent').length;
        }
        return {
            message: 'Dispute Successfully Opened', id: dispute?.id ?? null, job: job.ref, status: dispute?.status ?? 'recheck',
            openTx: tx.tx_hash, explorer: tx.explorer_url, round, runner, reviewers,
        };
    }

    async getDispute(token: string, job: string) {
        const authId = await this.authId(token);
        const row = await this.disputesRepository.getDisputeJob(authId, this.jobKey(job));
        if (!row) throw new NotFoundException('Job not found');
        return toDisputeView(row, authId, this.now());
    }

    async escalateDispute(token: string, id: string, body: EscalateDispute) {
        const authId = await this.authId(token);
        const job = await this.disputeJob(authId, id);
        const side: Side = job.buyerId === authId ? 'buyer' : 'seller';
        const account = this.accountOf(job, side);
        const price = num(job.agreedPrice ?? job.milestones[0]?.amount) ?? 0;
        const bond = body?.amount ?? bondNeeded(price);
        const contract = process.env['AGORA_CONTRACT_ID'] ?? 'agora-market.agora-testnet.testnet';
        const tx = await this.chainService.callAs('owner', account, 'ft_transfer_call', { receiver_id: contract, amount: units(bond), msg: `dispute_bond:${chainJobId(job)}` }, '1');
        const claim = claimOf(side);
        await this.notifyBoth(job, `Dispute on ${job.ref} sent to the DAO`, `The ${side} put down a ${bond.toFixed(2)} USDC bond and asks for a ${claim}. The bond comes back if the DAO agrees or splits.`);
        return { message: 'Dispute Successfully Escalated', id, job: job.ref, claim, bond, bondTx: tx.tx_hash, explorer: tx.explorer_url };
    }

    async ruleDispute(token: string, id: string, body: RuleDispute) {
        const authId = await this.authId(token);
        if ((process.env['AGORA_CHAIN_MODE'] ?? 'mock') !== 'mock') {
            throw new ForbiddenException('Only the Sputnik DAO can rule, through a passed proposal. This shortcut works with the mock chain only');
        }
        const job = await this.disputeJob(authId, id);
        const bps = body.outcome === 'release' ? 10_000 : body.outcome === 'refund' ? 0 : body.seller_share_bps;
        if (body.outcome === 'split' && !bps) throw new BadRequestException('A split needs seller_share_bps between 1 and 9999');
        const tx = await this.chainService.callAs('dao', daoAccount(), 'resolve_dispute', { job_id: chainJobId(job), outcome: body.outcome, seller_share_bps: bps });
        return this.settled(authId, job, id, tx.tx_hash, 'Dispute Successfully Ruled');
    }

    async finalizeDispute(token: string, id: string) {
        const authId = await this.authId(token);
        const job = await this.disputeJob(authId, id);
        const platform = process.env['AGORA_PLATFORM_ACCOUNT'] ?? 'agora-testnet.testnet';
        const tx = await this.chainService.callAs('platform', platform, 'finalize_default', { job_id: chainJobId(job) });
        return this.settled(authId, job, id, tx.tx_hash, 'Dispute Successfully Finalized');
    }

    async getTreasury() {
        const account = daoAccount();
        const balance = await this.disputesRepository.getBalance(account);
        return { account, balance: balance ? Number(balance.available) : 0, syncedAt: balance?.syncedAt ?? null, explorer: this.chainService.explorerAccountUrl(account) };
    }

    private async settled(authId: string, job: DisputeJob, id: string, txHash: string, message: string) {
        const fresh = (await this.disputesRepository.getDisputeJobById(authId, id)) ?? job;
        const view = toDisputeView(fresh, authId, this.now());
        const r = view.resolution;
        if (r) {
            const split = r.ruling === 'split' ? `split ${((r.sellerShareBps ?? 0) / 100).toFixed(2)}% to the seller` : r.ruling;
            await this.notifyBoth(job, `Dispute on ${job.ref} decided: ${split}`, `${(r.sellerAmount ?? 0).toFixed(2)} USDC to the seller, ${(r.buyerAmount ?? 0).toFixed(2)} USDC back to the buyer.`);
        }
        return { message, id, job: job.ref, txHash, explorer: this.chainService.explorerTxUrl(txHash), resolution: r };
    }

    private async disputeJob(authId: string, id: string): Promise<DisputeJob> {
        if (!isUUID(id)) throw new BadRequestException('Dispute id is not valid');
        const job = await this.disputesRepository.getDisputeJobById(authId, id);
        if (!job || job.milestones[0]?.disputes[0]?.id !== id) throw new NotFoundException('Dispute not found');
        return job;
    }

    private accountOf(job: DisputeJob, side: Side): string {
        const account = side === 'buyer' ? job.buyer.nearAccountId : job.seller?.nearAccountId;
        if (!account) throw new BadRequestException('You have no NEAR account on this job yet');
        return account;
    }

    private async notifyBoth(job: DisputeJob, title: string, body: string) {
        const notes: DisputeNote[] = [{ userId: job.buyerId, title, body }];
        if (job.seller) notes.push({ userId: job.seller.ownerId, title, body });
        await this.disputesRepository.createNotes(notes);
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }

    private jobKey(job: string): JobKey {
        if (/^J-\d+$/.test(job ?? '')) return { ref: job };
        if (isUUID(job)) return { id: job };
        throw new BadRequestException('Job id is not valid');
    }
}
