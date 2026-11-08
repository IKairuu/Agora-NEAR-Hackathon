import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateNegotiation {
    @IsNotEmpty({ message: 'Bid id is required' })
    @IsUUID('all', { message: 'Bid id must be a valid id' })
    bid_id!: string;

    @IsNotEmpty({ message: 'Write a message' })
    @IsString({ message: 'Message must be text' })
    @MaxLength(2000, { message: 'Message must be at most 2000 characters' })
    text!: string;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Price must be a number' })
    @IsPositive({ message: 'Price must be above 0' })
    price!: number;
}
