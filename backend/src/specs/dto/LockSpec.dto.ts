import { IsNotEmpty, IsUUID } from 'class-validator';

export class LockSpec {
    @IsNotEmpty({ message: 'Spec id is required' })
    @IsUUID('all', { message: 'Spec id must be a valid id' })
    id!: string;
}
