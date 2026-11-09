import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateThread {
    @IsOptional()
    @IsUUID('all', { message: 'Seller id must be a valid id' })
    seller_id!: string;

    @IsOptional()
    @Matches(/^(J-\d+|[0-9a-fA-F-]{36})$/, { message: 'Job id is not valid' })
    job_id!: string;

    @IsOptional()
    @IsString({ message: 'Title must be text' })
    @MaxLength(140, { message: 'Title must be at most 140 characters' })
    title!: string;

    @IsNotEmpty({ message: 'Write a message' })
    @IsString({ message: 'Message must be text' })
    @MaxLength(4000, { message: 'Message must be at most 4000 characters' })
    text!: string;
}
