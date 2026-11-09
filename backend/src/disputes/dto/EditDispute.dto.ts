import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateDispute } from './CreateDispute.dto.js';

export class EditDispute extends CreateDispute {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
