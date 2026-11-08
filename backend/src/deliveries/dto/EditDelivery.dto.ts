import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateDelivery } from './CreateDelivery.dto.js';

export class EditDelivery extends CreateDelivery {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
