import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class HireSeller {
    @IsNotEmpty({ message: 'Bid id is required' })
    @IsUUID('all', { message: 'Bid id must be a valid id' })
    bid_id!: string;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Price must be a number' })
    @IsPositive({ message: 'Price must be above 0' })
    price!: number;
}
