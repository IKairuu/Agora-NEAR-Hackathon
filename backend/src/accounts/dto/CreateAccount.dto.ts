import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAccount {
    @IsOptional()
    @IsString({ message: 'Display name must be text' })
    @MaxLength(80, { message: 'Display name must be at most 80 characters' })
    display_name!: string;

    @IsOptional()
    @IsIn(['hire', 'work'], { message: 'Role must be hire or work' })
    role!: string;

    @IsOptional()
    @IsIn(['buy', 'sell'], { message: 'Mode must be buy or sell' })
    mode!: string;

    @IsOptional()
    @IsIn(['light', 'dark', 'system'], { message: 'Theme must be light, dark or system' })
    theme!: string;

    @IsOptional()
    @IsString({ message: 'Location must be text' })
    @MaxLength(80, { message: 'Location must be at most 80 characters' })
    location!: string;

    @IsOptional()
    @IsString({ message: 'Bio must be text' })
    @MaxLength(1000, { message: 'Bio must be at most 1000 characters' })
    bio!: string;
}
