import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateBid {
    @IsNotEmpty({ message: 'Job id is required' })
    @Matches(/^(J-\d+|[0-9a-fA-F-]{36})$/, { message: 'Job id is not valid' })
    job_id!: string;

    @IsNotEmpty({ message: 'Price is required' })
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Price must be a number' })
    @IsPositive({ message: 'Price must be above 0' })
    price!: number;

    @IsNotEmpty({ message: 'Delivery days are required' })
    @IsInt({ message: 'Delivery days must be a whole number' })
    @Min(1, { message: 'Delivery days must be at least 1' })
    @Max(60, { message: 'Delivery days must be at most 60' })
    days!: number;

    @IsOptional()
    @IsString({ message: 'Note must be text' })
    @MaxLength(1000, { message: 'Note must be at most 1000 characters' })
    note!: string;

    @IsOptional()
    @IsUUID('all', { message: 'Seller id must be a valid id' })
    seller_id!: string;
}
