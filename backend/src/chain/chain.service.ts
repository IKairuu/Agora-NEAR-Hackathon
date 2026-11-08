import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { mockIdMethods, mockViews } from './mock-state';

export type ChainRole = 'owner' | 'transaction_agent' | 'guardian' | 'fraud_oracle' | 'reviewer' | 'platform';

export interface ChainCallResult {
    tx_hash: string;
    explorer_url: string;
    result: unknown;
}

export interface UnsignedTx {
    unsigned_tx_base64: string;
}

export interface CreatedAccount {
    account_id: string;
    agents_account_id: string;
}

@Injectable()
export class ChainService {
    private readonly mode = process.env['AGORA_CHAIN_MODE'] ?? 'mock';
    private readonly network = process.env['NEAR_NETWORK'] ?? 'testnet';
    private readonly contractId = process.env['AGORA_CONTRACT_ID'] ?? 'agora-market.agora-testnet.testnet';
    private counter = 0;

    async callAs(role: ChainRole, accountId: string, method: string, args: Record<string, unknown>, deposit = '0'): Promise<ChainCallResult> {
        this.requireMock();
        if (!accountId) {
            throw new BadRequestException(`No account to sign ${method} as ${role}`);
        }
        this.counter += 1;
        const txHash = `mock-${method}-${this.counter}`;
        const result = mockIdMethods.includes(method) ? String(this.counter) : null;
        return { tx_hash: txHash, explorer_url: this.explorerTxUrl(txHash), result };
    }

    async buildUnsignedTx(signerId: string, method: string, args: Record<string, unknown>, deposit = '0'): Promise<UnsignedTx> {
        const payload = JSON.stringify({ signer_id: signerId, receiver_id: this.contractId, method, args, deposit });
        return { unsigned_tx_base64: Buffer.from(payload).toString('base64') };
    }

    async view<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
        this.requireMock();
        const handler = mockViews[method];
        if (!handler) {
            throw new BadRequestException(`Unknown view method ${method}`);
        }
        return handler(args) as T;
    }

    async createAccount(profileId: string): Promise<CreatedAccount> {
        this.requireMock();
        const name = `agora-${profileId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()}`;
        return {
            account_id: `${name}.${this.network}`,
            agents_account_id: `agents.${name}.${this.network}`,
        };
    }

    explorerTxUrl(txHash: string): string {
        return `https://${this.network}.nearblocks.io/txns/${txHash}`;
    }

    explorerAccountUrl(accountId: string): string {
        return `https://${this.network}.nearblocks.io/address/${accountId}`;
    }

    private requireMock(): void {
        if (this.mode !== 'mock') {
            throw new ServiceUnavailableException('Real chain mode is not built yet. Set AGORA_CHAIN_MODE=mock');
        }
    }
}
