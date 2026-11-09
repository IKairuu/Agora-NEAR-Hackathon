import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSellerProfileExperience {
    @IsNotEmpty({ message: 'Role is required' })
    @IsString({ message: 'Role must be text' })
    @MaxLength(120, { message: 'Role must be at most 120 characters' })
    role!: string;

    @IsNotEmpty({ message: 'Company is required' })
    @IsString({ message: 'Company must be text' })
    @MaxLength(120, { message: 'Company must be at most 120 characters' })
    company!: string;

    @IsNotEmpty({ message: 'Start date is required' })
    @IsDateString({}, { message: 'Start date must be a date' })
    start_date!: string;

    @IsOptional()
    @IsDateString({}, { message: 'End date must be a date' })
    end_date!: string;

    @IsOptional()
    @IsString({ message: 'Summary must be text' })
    @MaxLength(1000, { message: 'Summary must be at most 1000 characters' })
    summary!: string;
}
