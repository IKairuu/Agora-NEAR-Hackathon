import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';
import { GigTone, ThumbKind } from '../../generated/prisma/enums.js';

export class CreateService {
    @IsNotEmpty({ message: 'Title is required' })
    @IsString({ message: 'Title must be text' })
    @MaxLength(120, { message: 'Title must be at most 120 characters' })
    title!: string;

    @IsNotEmpty({ message: 'Thumbnail is required' })
    @IsEnum(ThumbKind, { message: 'Invalid thumbnail' })
    thumb!: ThumbKind;

    @IsNotEmpty({ message: 'Tone is required' })
    @IsEnum(GigTone, { message: 'Invalid tone' })
    tone!: GigTone;

    @IsNotEmpty({ message: 'Category is required' })
    @IsString({ message: 'Category must be text' })
    category!: string;

    @IsNotEmpty({ message: 'Starting price is required' })
    @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Starting price must be a number' })
    @IsPositive({ message: 'Starting price must be above 0' })
    from_price!: number;

    @IsNotEmpty({ message: 'Delivery days are required' })
    @IsInt({ message: 'Delivery days must be a whole number' })
    @Min(1, { message: 'Delivery days must be at least 1' })
    @Max(60, { message: 'Delivery days must be at most 60' })
    days!: number;

    @IsNotEmpty({ message: 'Request prompt is required' })
    @IsString({ message: 'Request prompt must be text' })
    @MaxLength(500, { message: 'Request prompt must be at most 500 characters' })
    prompt!: string;

    @IsOptional()
    @IsBoolean({ message: 'Active must be true or false' })
    active!: boolean;
}
