import { IsNumber, IsOptional, IsPositive, Max } from 'class-validator';

export class EscalateDispute {
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Bond must be a number' })
    @IsPositive({ message: 'Bond must be above 0' })
    @Max(10000, { message: 'Bond must be at most 10000 USDC' })
    amount!: number;
}
