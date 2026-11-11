import { IsNotEmpty, IsString } from 'class-validator';

export class JobAction {
    @IsNotEmpty({ message: 'Job id is required' })
    @IsString({ message: 'Job id must be text' })
    job_id!: string;
}
