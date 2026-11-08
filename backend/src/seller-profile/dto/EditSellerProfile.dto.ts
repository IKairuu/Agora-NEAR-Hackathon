import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateSellerProfile } from './CreateSellerProfile.dto.js';

export class EditSellerProfile extends CreateSellerProfile {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
