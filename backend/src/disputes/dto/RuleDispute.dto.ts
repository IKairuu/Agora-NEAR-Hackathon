import { IsEnum, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';

export enum DisputeOutcome {
    release = 'release',
    refund = 'refund',
    split = 'split',
}

export class RuleDispute {
    @IsNotEmpty({ message: 'Outcome is required' })
    @IsEnum(DisputeOutcome, { message: 'Invalid outcome: use release, refund or split' })
    outcome!: DisputeOutcome;

    @IsOptional()
    @IsInt({ message: 'Seller share must be a whole number of basis points' })
    @Min(1, { message: 'Seller share must be at least 1' })
    @Max(9999, { message: 'Seller share must be at most 9999' })
    seller_share_bps!: number;
}
