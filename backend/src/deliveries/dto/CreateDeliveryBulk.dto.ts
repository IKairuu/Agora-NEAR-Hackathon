import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateDelivery } from './CreateDelivery.dto.js';

export class CreateDeliveryBulk {
    @IsArray({ message: 'Items must be a list' })
    @ArrayMinSize(1, { message: 'Send at least one item' })
    @ValidateNested({ each: true })
    @Type(() => CreateDelivery)
    items!: CreateDelivery[];
}
