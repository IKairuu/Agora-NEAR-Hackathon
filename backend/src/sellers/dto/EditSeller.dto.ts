import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateSeller } from './CreateSeller.dto.js';

export class EditSeller extends CreateSeller {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
