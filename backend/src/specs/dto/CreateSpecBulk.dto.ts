import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateSpec } from './CreateSpec.dto.js';

export class CreateSpecBulk {
    @IsArray({ message: 'Items must be a list' })
    @ArrayMinSize(1, { message: 'Send at least one item' })
    @ValidateNested({ each: true })
    @Type(() => CreateSpec)
    items!: CreateSpec[];
}
