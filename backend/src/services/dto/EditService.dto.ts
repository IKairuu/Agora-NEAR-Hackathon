import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateService } from './CreateService.dto.js';

export class EditService extends CreateService {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
