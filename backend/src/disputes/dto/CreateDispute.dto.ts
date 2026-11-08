import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDispute {
    @IsNotEmpty({ message: 'Job id is required' })
    @IsString({ message: 'Job id must be text' })
    job_id!: string;

    @IsOptional()
    @IsInt({ message: 'Milestone index must be a whole number' })
    @Min(0, { message: 'Milestone index cannot be negative' })
    milestone_idx!: number;

    @IsNotEmpty({ message: 'Reason is required' })
    @IsString({ message: 'Reason must be text' })
    @MaxLength(500, { message: 'Reason must be at most 500 characters' })
    reason!: string;
}
