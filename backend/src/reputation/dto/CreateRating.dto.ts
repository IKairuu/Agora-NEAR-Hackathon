import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateRating {
    @IsNotEmpty({ message: 'Job id is required' })
    @IsString({ message: 'Job id must be text' })
    job_id!: string;

    @IsNotEmpty({ message: 'Stars are required' })
    @IsInt({ message: 'Stars must be a whole number' })
    @Min(1, { message: 'Stars must be between 1 and 5' })
    @Max(5, { message: 'Stars must be between 1 and 5' })
    stars!: number;

    @IsOptional()
    @IsString({ message: 'Comment must be text' })
    @MaxLength(500, { message: 'Comment must be at most 500 characters' })
    comment!: string;
}
