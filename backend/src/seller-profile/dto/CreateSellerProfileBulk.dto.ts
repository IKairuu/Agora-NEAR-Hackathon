import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateSellerProfile } from './CreateSellerProfile.dto.js';

export class CreateSellerProfileBulk {
    @IsArray({ message: 'Items must be a list' })
    @ArrayMinSize(1, { message: 'Send at least one item' })
    @ValidateNested({ each: true })
    @Type(() => CreateSellerProfile)
    items!: CreateSellerProfile[];
}
