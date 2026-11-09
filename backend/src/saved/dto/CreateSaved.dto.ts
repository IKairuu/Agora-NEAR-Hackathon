import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SavedKind } from '../../generated/prisma/enums.js';

export class CreateSaved {
    @IsNotEmpty({ message: 'Kind is required' })
    @IsEnum(SavedKind, { message: 'Invalid saved kind' })
    kind!: SavedKind;

    @IsNotEmpty({ message: 'Target id is required' })
    @IsString({ message: 'Target id must be text' })
    @MaxLength(64, { message: 'Target id must be at most 64 characters' })
    target_id!: string;
}
