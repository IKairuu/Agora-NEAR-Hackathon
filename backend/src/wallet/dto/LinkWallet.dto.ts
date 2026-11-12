import { IsBase64, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class LinkWallet {
    @IsNotEmpty({ message: 'Account is required' })
    @Matches(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, { message: 'That is not a NEAR account name' })
    @MaxLength(64, { message: 'A NEAR account name has at most 64 characters' })
    account_id!: string;

    @IsNotEmpty({ message: 'Public key is required' })
    @Matches(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,60}$/, { message: 'Public key must be an ed25519 key' })
    public_key!: string;

    @IsNotEmpty({ message: 'Signature is required' })
    @IsBase64({}, { message: 'Signature must be base64' })
    signature!: string;

    @IsNotEmpty({ message: 'Message is required' })
    @IsString({ message: 'Message must be text' })
    @MaxLength(300, { message: 'Message is too long' })
    message!: string;

    @IsNotEmpty({ message: 'Nonce is required' })
    @IsBase64({}, { message: 'Nonce must be base64' })
    nonce!: string;

    @IsOptional()
    @IsString({ message: 'Callback URL must be text' })
    @MaxLength(500, { message: 'Callback URL is too long' })
    callback_url?: string;
}
