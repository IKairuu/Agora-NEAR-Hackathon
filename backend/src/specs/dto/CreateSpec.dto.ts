import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CreateSpecCheck } from './CreateSpecCheck.dto.js';
import { CreateSpecTestFile } from './CreateSpecTestFile.dto.js';

export class CreateSpec {
    @IsNotEmpty({ message: 'Job id is required' })
    @IsString({ message: 'Job id must be text' })
    job_id!: string;

    @IsNotEmpty({ message: 'Test command is required' })
    @IsString({ message: 'Test command must be text' })
    @MaxLength(500, { message: 'Test command must be at most 500 characters' })
    test_command!: string;

    @IsOptional()
    @IsString({ message: 'Build command must be text' })
    @MaxLength(500, { message: 'Build command must be at most 500 characters' })
    build_command!: string;

    @IsOptional()
    @IsArray({ message: 'Failing tests must be a list' })
    @IsString({ each: true, message: 'Each failing test must be text' })
    failing_tests!: string[];

    @IsOptional()
    @IsArray({ message: 'Allowed paths must be a list' })
    @IsString({ each: true, message: 'Each allowed path must be text' })
    allowed_paths!: string[];

    @IsOptional()
    @IsArray({ message: 'Test files must be a list' })
    @ValidateNested({ each: true })
    @Type(() => CreateSpecTestFile)
    test_files!: CreateSpecTestFile[];

    @IsArray({ message: 'Checks must be a list' })
    @ArrayMinSize(1, { message: 'A spec needs at least one check' })
    @ValidateNested({ each: true })
    @Type(() => CreateSpecCheck)
    checks!: CreateSpecCheck[];
}
