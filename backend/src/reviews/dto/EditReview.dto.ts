import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateReview } from './CreateReview.dto.js';

export class EditReview extends CreateReview {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
