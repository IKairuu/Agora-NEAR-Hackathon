import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateRequest } from './CreateRequest.dto.js';

export class EditRequest extends CreateRequest {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
