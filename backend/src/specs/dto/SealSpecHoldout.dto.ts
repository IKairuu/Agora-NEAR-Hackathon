import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { CreateSpecTestFile } from './CreateSpecTestFile.dto.js';

export class SealSpecHoldout {
    @IsNotEmpty({ message: 'Spec id is required' })
    @IsUUID('all', { message: 'Spec id must be a valid id' })
    spec_id!: string;

    @IsArray({ message: 'Hidden test files must be a list' })
    @ArrayMinSize(1, { message: 'Add at least one hidden test file' })
    @ArrayMaxSize(50, { message: 'Add at most 50 hidden test files' })
    @ValidateNested({ each: true })
    @Type(() => CreateSpecTestFile)
    test_files!: CreateSpecTestFile[];

    @IsOptional()
    @IsString({ message: 'Hidden test command must be text' })
    @MaxLength(500, { message: 'Hidden test command must be at most 500 characters' })
    test_command!: string;
}
