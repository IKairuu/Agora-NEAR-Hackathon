import { IsNotEmpty, Matches } from 'class-validator';

export class PublishJob {
    @IsNotEmpty({ message: 'Job id is required' })
    @Matches(/^(J-\d+|[0-9a-fA-F-]{36})$/, { message: 'Job id is not valid' })
    id!: string;
}
