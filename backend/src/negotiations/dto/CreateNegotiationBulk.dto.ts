import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateNegotiation } from './CreateNegotiation.dto.js';

export class CreateNegotiationBulk {
    @IsArray({ message: 'Items must be a list' })
    @ArrayMinSize(1, { message: 'Send at least one item' })
    @ValidateNested({ each: true })
    @Type(() => CreateNegotiation)
    items!: CreateNegotiation[];
}
