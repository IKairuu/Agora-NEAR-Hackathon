import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CreateSellerProfileExperience } from './CreateSellerProfileExperience.dto.js';

export class CreateSellerProfile {
    @IsNotEmpty({ message: 'Wizard step is required' })
    @IsInt({ message: 'Wizard step must be a whole number' })
    @Min(0, { message: 'Wizard step must be between 0 and 5' })
    @Max(5, { message: 'Wizard step must be between 0 and 5' })
    step!: number;

    @IsOptional()
    @IsString({ message: 'Display name must be text' })
    @MaxLength(80, { message: 'Display name must be at most 80 characters' })
    display_name!: string;

    @IsOptional()
    @IsString({ message: 'Professional title must be text' })
    @MaxLength(120, { message: 'Professional title must be at most 120 characters' })
    headline!: string;

    @IsOptional()
    @IsIn(['me', 'agent'], { message: 'Coding must be done by me or agent' })
    coder!: string;

    @IsOptional()
    @Matches(/^[a-z0-9][a-z0-9-]{1,31}$/, { message: 'Agent name must be 2 to 32 lowercase letters, numbers or dashes' })
    agent_name!: string;

    @IsOptional()
    @IsString({ message: 'Agent model must be text' })
    @MaxLength(120, { message: 'Agent model must be at most 120 characters' })
    agent_model!: string;

    @IsOptional()
    @IsInt({ message: 'Jobs at once must be a whole number' })
    @Min(1, { message: 'Jobs at once must be at least 1' })
    @Max(10, { message: 'Jobs at once must be at most 10' })
    max_jobs!: number;

    @IsOptional()
    @IsString({ message: 'Delivery terms must be text' })
    @MaxLength(200, { message: 'Delivery terms must be at most 200 characters' })
    delivery_terms!: string;

    @IsOptional()
    @Matches(/^[A-Z]{1,3}$/, { message: 'Initials must be 1 to 3 capital letters' })
    initials!: string;

    @IsOptional()
    @IsString({ message: 'Country must be text' })
    country!: string;

    @IsOptional()
    @IsString({ message: 'About must be text' })
    @MaxLength(1000, { message: 'About must be at most 1000 characters' })
    about!: string;

    @IsOptional()
    @IsArray({ message: 'Languages must be a list' })
    @IsString({ each: true, message: 'Each language must be text' })
    langs!: string[];

    @IsOptional()
    @IsArray({ message: 'Experience must be a list' })
    @ValidateNested({ each: true })
    @Type(() => CreateSellerProfileExperience)
    experience!: CreateSellerProfileExperience[];

    @IsOptional()
    @Matches(/^[A-Za-z0-9-]{1,39}$/, { message: 'GitHub username is not valid' })
    github_username!: string;

    @IsOptional()
    @IsArray({ message: 'Skills must be a list' })
    @IsString({ each: true, message: 'Each skill must be text' })
    skills!: string[];

    @IsOptional()
    @IsArray({ message: 'Categories must be a list' })
    @IsString({ each: true, message: 'Each category must be text' })
    categories!: string[];

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Starting price must be a number' })
    @IsPositive({ message: 'Starting price must be above 0' })
    price_from!: number;

    @IsOptional()
    @IsInt({ message: 'Delivery days must be a whole number' })
    @Min(1, { message: 'Delivery days must be at least 1' })
    @Max(60, { message: 'Delivery days must be at most 60' })
    days!: number;

    @IsOptional()
    @IsIn(['near', 'eth', 'base'], { message: 'Invalid payout chain' })
    payout_chain!: string;

    @IsOptional()
    @IsString({ message: 'Payout address must be text' })
    @MaxLength(128, { message: 'Payout address must be at most 128 characters' })
    payout_address!: string;

    @IsOptional()
    @IsBoolean({ message: 'Online must be true or false' })
    online!: boolean;
}
