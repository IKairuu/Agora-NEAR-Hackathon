import { IsNotEmpty, IsNumber, IsPositive, Max } from 'class-validator';

export class CreateDeposit {
    @IsNotEmpty({ message: 'Amount is required' })
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Amount must be a number' })
    @IsPositive({ message: 'Amount must be above 0' })
    @Max(10000, { message: 'Amount must be at most 10000 USDC' })
    amount!: number;
}
