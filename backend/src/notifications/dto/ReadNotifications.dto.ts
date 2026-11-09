import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class ReadNotifications {
    @IsOptional()
    @IsArray({ message: 'Ids must be a list' })
    @IsUUID('all', { each: true, message: 'Each id must be a valid id' })
    ids!: string[];
}
