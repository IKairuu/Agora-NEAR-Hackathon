import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateReview {
    @IsNotEmpty({ message: 'Delivery id is required' })
    @IsUUID('all', { message: 'Delivery id must be a valid id' })
    delivery_id!: string;

    @IsOptional()
    @IsString({ message: 'Reason must be text' })
    @MaxLength(1000, { message: 'Reason must be at most 1000 characters' })
    reason!: string;
}
