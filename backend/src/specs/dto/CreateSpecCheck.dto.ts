import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CheckWeight } from '../../generated/prisma/enums.js';

export class CreateSpecCheck {
    @IsNotEmpty({ message: 'Check name is required' })
    @IsString({ message: 'Check name must be text' })
    @MaxLength(200, { message: 'Check name must be at most 200 characters' })
    name!: string;

    @IsNotEmpty({ message: 'How the check is verified is required' })
    @IsString({ message: 'How verified must be text' })
    @MaxLength(500, { message: 'How verified must be at most 500 characters' })
    how_verified!: string;

    @IsOptional()
    @IsEnum(CheckWeight, { message: 'Invalid check weight' })
    weight!: CheckWeight;
}
