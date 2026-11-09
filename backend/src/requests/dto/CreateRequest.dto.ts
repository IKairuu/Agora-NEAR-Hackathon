import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUrl, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateRequest {
    @IsNotEmpty({ message: 'Describe the job in a sentence or two' })
    @IsString({ message: 'The request must be text' })
    @MaxLength(4000, { message: 'The request must be at most 4000 characters' })
    text!: string;

    @IsOptional()
    @IsString({ message: 'Title must be text' })
    @MaxLength(140, { message: 'Title must be at most 140 characters' })
    title!: string;

    @IsOptional()
    @IsIn(['rust', 'fe', 'tests', 'scripts'], { message: 'Invalid category' })
    category!: string;

    @IsOptional()
    @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Repository URL must be an https link' })
    repo_url!: string;

    @IsOptional()
    @Matches(/^[0-9a-f]{7,40}$/i, { message: 'Base commit must be a git commit hash' })
    base_commit!: string;

    @IsOptional()
    @IsString({ message: 'Budget must be text' })
    @MaxLength(40, { message: 'Budget must be at most 40 characters' })
    budget_label!: string;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Hidden maximum must be a number' })
    @IsPositive({ message: 'Hidden maximum must be above 0' })
    budget_max!: number;

    @IsOptional()
    @IsUUID('all', { message: 'Service id must be a valid id' })
    service_id!: string;
}
