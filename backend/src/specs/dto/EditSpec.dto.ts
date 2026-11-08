import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateSpec } from './CreateSpec.dto.js';

export class EditSpec extends CreateSpec {
    @IsNotEmpty({ message: 'Id is required' })
    @IsUUID('all', { message: 'Id must be a valid id' })
    id!: string;
}
