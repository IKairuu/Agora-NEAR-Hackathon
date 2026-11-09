import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateSellerStake {
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Amount must be a number' })
    @Min(1, { message: 'Stake at least 1 USDC' })
    @Max(1000, { message: 'Stake at most 1000 USDC' })
    amount!: number;
}
