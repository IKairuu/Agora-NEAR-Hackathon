import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateBid } from './CreateBid.dto.js';

export class EditBid extends CreateBid {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
