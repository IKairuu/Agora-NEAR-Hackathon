import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateRequest } from './CreateRequest.dto.js';

export class CreateRequestBulk {
    @IsArray({ message: 'Items must be a list' })
    @ArrayMinSize(1, { message: 'Send at least one item' })
    @ValidateNested({ each: true })
    @Type(() => CreateRequest)
    items!: CreateRequest[];
}
