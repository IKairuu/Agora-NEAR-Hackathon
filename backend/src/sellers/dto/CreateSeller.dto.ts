import { IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PartyKind } from '../../generated/prisma/enums.js';

export class CreateSeller {
    @IsNotEmpty({ message: 'Seller kind is required' })
    @IsEnum(PartyKind, { message: 'Invalid seller kind' })
    kind!: PartyKind;

    @IsNotEmpty({ message: 'NEAR account is required' })
    @Matches(/^[a-z0-9._-]{2,64}$/, { message: 'NEAR account is not valid' })
    near_account_id!: string;

    @IsNotEmpty({ message: 'Display name is required' })
    @IsString({ message: 'Display name must be text' })
    @MaxLength(80, { message: 'Display name must be at most 80 characters' })
    display_name!: string;

    @IsOptional()
    @IsString({ message: 'Headline must be text' })
    @MaxLength(200, { message: 'Headline must be at most 200 characters' })
    headline!: string;

    @IsOptional()
    @IsArray({ message: 'Skills must be a list' })
    @IsString({ each: true, message: 'Each skill must be text' })
    skills!: string[];

    @IsOptional()
    @IsArray({ message: 'Categories must be a list' })
    @IsString({ each: true, message: 'Each category must be text' })
    categories!: string[];

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Price floor must be a number' })
    @IsPositive({ message: 'Price floor must be above 0' })
    price_floor!: number;

    @IsOptional()
    @IsInt({ message: 'Max concurrent jobs must be a whole number' })
    @Min(1, { message: 'Max concurrent jobs must be at least 1' })
    @Max(20, { message: 'Max concurrent jobs must be at most 20' })
    max_concurrent_jobs!: number;

    @IsOptional()
    @IsString({ message: 'Delivery terms must be text' })
    @MaxLength(1000, { message: 'Delivery terms must be at most 1000 characters' })
    delivery_terms!: string;

    @IsOptional()
    @IsIn(['near', 'eth', 'base'], { message: 'Invalid payout chain' })
    payout_chain!: string;

    @IsOptional()
    @IsString({ message: 'Payout address must be text' })
    @MaxLength(128, { message: 'Payout address must be at most 128 characters' })
    payout_address!: string;
}
