import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsPositive, IsString, Max } from 'class-validator';

export class CreateMandate {
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Per-job cap must be a number' })
    @IsPositive({ message: 'Per-job cap must be above 0' })
    @Max(100000, { message: 'Per-job cap must be at most 100000 USDC' })
    per_job_cap!: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Daily cap must be a number' })
    @IsPositive({ message: 'Daily cap must be above 0' })
    @Max(100000, { message: 'Daily cap must be at most 100000 USDC' })
    daily_cap!: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'New-seller cap must be a number' })
    @IsPositive({ message: 'New-seller cap must be above 0' })
    @Max(100000, { message: 'New-seller cap must be at most 100000 USDC' })
    new_seller_cap!: number;

    @IsOptional()
    @IsIn([6, 12, 24], { message: 'Review window must be 6, 12 or 24 hours' })
    review_window_hours!: number;

    @IsOptional()
    @IsArray({ message: 'Categories must be a list' })
    @IsString({ each: true, message: 'Each category must be text' })
    categories!: string[];

    @IsOptional()
    @IsBoolean({ message: 'Strict must be true or false' })
    strict!: boolean;

    @IsOptional()
    @IsArray({ message: 'Approved sellers must be a list' })
    @ArrayMaxSize(100, { message: 'At most 100 approved sellers' })
    @IsString({ each: true, message: 'Each approved seller must be a NEAR account' })
    approved_sellers!: string[];
}
