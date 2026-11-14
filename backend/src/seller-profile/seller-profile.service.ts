import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { initialsOf } from '../accounts/accounts.service.js';
import { AuthService } from '../auth/auth.service.js';
import { SupabaseAdminService } from '../auth/supabase-admin.service.js';
import { ChainService } from '../chain/chain.service.js';
import { ownerOf } from '../indexer/indexer.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateSellerStake } from './dto/CreateSellerStake.dto.js';
import { EditSellerProfile } from './dto/EditSellerProfile.dto.js';
import { SellerProfileRepository, SellerProfileRow } from './seller-profile.repository.js';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const STARTER_STAKE_USDC = 10;

export const toSellerProfile = (row: SellerProfileRow | null, fallbackName: string) => {
    const name = row?.displayName ?? fallbackName;
    return {
        id: row?.id ?? null,
        step: row?.step ?? 0,
        published: Boolean(row?.publishedAt),
        publishedAt: row?.publishedAt ?? null,
        sellerId: row?.sellerId ?? null,
        name,
        initials: row?.initials ?? initialsOf(name),
        headline: row?.headline ?? '',
        country: row?.country ?? '',
        about: row?.about ?? '',
        langs: row?.langs ?? [],
        experience: row?.experience ?? [],
        githubUsername: row?.githubUsername ?? '',
        skills: row?.skills ?? [],
        categories: row?.categories ?? [],
        priceFrom: row?.priceFrom === null || row?.priceFrom === undefined ? null : Number(row.priceFrom),
        days: row?.days ?? null,
        coder: row?.coder ?? 'me',
        agentName: row?.agentName ?? '',
        agentModel: row?.agentModel ?? '',
        maxJobs: row?.maxJobs ?? 1,
        deliveryTerms: row?.deliveryTerms ?? '',
        payoutChain: row?.payoutChain ?? 'near',
        payoutAddress: row?.payoutAddress ?? '',
        level: row?.level ?? 'New seller',
        online: row?.online ?? false,
        acct: row?.user.nearAccountId ?? '',
    };
};

@Injectable()
export class SellerProfileService {
    constructor(
        private readonly sellerProfileRepository: SellerProfileRepository,
        private readonly authService: AuthService,
        private readonly chainService: ChainService,
        private readonly supabaseAdmin: SupabaseAdminService,
    ) {}

    async getProfile(token: string) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        const row = await this.sellerProfileRepository.getProfile(claims.id);
        return toSellerProfile(row, claims.name);
    }

    async editProfile(token: string, body: EditSellerProfile) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        if (body.categories?.length) {
            const known = await this.sellerProfileRepository.findCategories(body.categories);
            const unknown = body.categories.filter((c) => !known.includes(c));
            if (unknown.length) throw new BadRequestException(`Unknown category: ${unknown.join(', ')}`);
        }
        /* the GitHub login only comes from the linked GitHub sign-in (POST v1/github), never from the form */
        const row = await this.sellerProfileRepository.saveProfile(claims.id, claims.name, { ...body, github_username: undefined } as unknown as EditSellerProfile);
        return { message: 'Seller Profile Successfully Saved', id: row.id, step: row.step };
    }

    /** One AGORA account has at most one GitHub: the one linked in Supabase Auth. Saves its login on the seller profile (or clears it after an unlink). */
    async syncGithub(token: string) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        const login = await this.supabaseAdmin.getGithubLogin(claims.id);
        const row = await this.sellerProfileRepository.getProfile(claims.id);
        if (row || login) await this.sellerProfileRepository.saveProfile(claims.id, claims.name, { github_username: login ?? null } as unknown as EditSellerProfile);
        return { github: login };
    }

    async publishProfile(token: string) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        const row = await this.sellerProfileRepository.getProfile(claims.id);
        if (!row) throw new BadRequestException('Fill in your seller profile first');
        const name = row.displayName ?? claims.name;
        const agent = row.coder === 'agent';
        const payoutChain = row.payoutChain ?? 'near';
        if (!name) throw new BadRequestException('Add a display name');
        if (!row.skills.length) throw new BadRequestException('Pick at least one skill');
        if (!row.categories.length) throw new BadRequestException('Pick at least one category you take');
        if (row.priceFrom === null) throw new BadRequestException('Set your minimum price');
        if (agent && !row.agentName) throw new BadRequestException('Name your coding agent');
        if (payoutChain !== 'near' && !EVM_ADDRESS.test(row.payoutAddress ?? '')) {
            throw new BadRequestException('Payout address must be a full 0x address with 40 hex characters');
        }

        let acct = row.user.nearAccountId;
        let agentsAcct = row.user.agentsAccountId;
        if (!acct || !agentsAcct) {
            const created = await this.chainService.createAccount(claims.id);
            acct = acct ?? created.account_id;
            agentsAcct = agentsAcct ?? created.agents_account_id;
            await this.sellerProfileRepository.setAccountIds(claims.id, acct, agentsAcct);
        }
        /*
         * On chain only agents.<owner> counts as the owner's agent (the contract strips that prefix), so in real mode
         * every seller, person or AI agent, bids and delivers through agents.<owner> and is paid on <owner>.
         * The mock keeps its readable <name>.agents.<owner> names.
         */
        const real = !this.chainService.isMock();
        const sellerAcct = real ? agentsAcct : agent ? `${row.agentName}.${agentsAcct}` : acct;

        try {
            const seller = await this.sellerProfileRepository.publish(claims.id, row.id, row.sellerId, {
                kind: agent ? 'agent' : 'human',
                nearAccountId: sellerAcct,
                displayName: agent ? row.agentName! : name,
                headline: row.headline,
                skills: row.skills,
                categories: row.categories,
                priceFloor: row.priceFrom,
                maxConcurrentJobs: row.maxJobs ?? 1,
                deliveryTerms: row.deliveryTerms,
                payoutChain,
                payoutAddress: payoutChain === 'near' ? (real ? ownerOf(sellerAcct) : sellerAcct) : row.payoutAddress!,
            });
            const registered = await this.registerSeller(real ? ownerOf(seller.nearAccountId) : seller.nearAccountId);
            return {
                message: row.sellerId ? 'Seller Profile Successfully Updated' : 'Seller Profile Successfully Published',
                ...registered,
                id: seller.id,
                acct: seller.nearAccountId,
                explorer: this.chainService.explorerAccountUrl(seller.nearAccountId),
            };
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('That NEAR account is already used by another seller');
            }
            throw e;
        }
    }

    async addStake(token: string, body: CreateSellerStake) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        const seller = await this.sellerProfileRepository.getSellerAccount(claims.id);
        if (!seller) throw new BadRequestException('Publish your seller profile first');
        const amount = body.amount ?? STARTER_STAKE_USDC;
        const contract = process.env['AGORA_CONTRACT_ID'] ?? 'agora-market.agora-testnet.testnet';
        const tx = await this.chainService.callAs('owner', seller.nearAccountId, 'ft_transfer_call', {
            receiver_id: contract, amount: String(Math.round(amount * 1_000_000)), msg: 'starter_stake',
        }, '1');
        const stake = Number(seller.stake) + amount;
        return { message: 'Stake Successfully Added', id: seller.id, amount, stake, newSellerCapLifted: stake >= STARTER_STAKE_USDC, stakeTx: tx.tx_hash };
    }

    async returnStake(token: string) {
        const claims = await this.authService.getSessionClaims((token ?? '').replace('Bearer ', ''));
        const seller = await this.sellerProfileRepository.getSellerAccount(claims.id);
        if (!seller) throw new BadRequestException('Publish your seller profile first');
        const tx = await this.chainService.callAs('owner', seller.nearAccountId, 'return_stake', {}, '1');
        return { message: 'Stake Successfully Returned', id: seller.id, amount: Number(seller.stake), stakeTx: tx.tx_hash };
    }

    private async registerSeller(accountId: string): Promise<{ registered: boolean; registerTx: string | null; registerError: string | null }> {
        try {
            const platform = process.env['AGORA_PLATFORM_ACCOUNT'] ?? 'agora-testnet.testnet';
            const tx = await this.chainService.callAs('platform', platform, 'register_seller', { account_id: accountId }, '1');
            return { registered: true, registerTx: tx.tx_hash, registerError: null };
        } catch (e) {
            return { registered: false, registerTx: null, registerError: e instanceof Error ? e.message : 'Seller registration failed' };
        }
    }
}
