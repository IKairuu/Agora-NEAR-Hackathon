import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SyncWalletTx {
    @IsNotEmpty({ message: 'Transaction hash is required' })
    @IsString({ message: 'Transaction hash must be text' })
    @Matches(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/, { message: 'That is not a NEAR transaction hash' })
    tx_hash!: string;
}
