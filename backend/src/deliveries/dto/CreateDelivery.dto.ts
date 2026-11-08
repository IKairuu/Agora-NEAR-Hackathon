import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, Min } from 'class-validator';

export class CreateDelivery {
    @IsNotEmpty({ message: 'Job id is required' })
    @IsString({ message: 'Job id must be text' })
    job_id!: string;

    @IsOptional()
    @IsInt({ message: 'Milestone index must be a whole number' })
    @Min(0, { message: 'Milestone index cannot be negative' })
    milestone_idx!: number;

    @IsNotEmpty({ message: 'Commit is required' })
    @Matches(/^[0-9a-f]{7,40}$/i, { message: 'Commit must be a git commit hash' })
    commit_sha!: string;

    @IsNotEmpty({ message: 'Repository URL is required' })
    @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Repository URL must be an https link' })
    repo_url!: string;
}
