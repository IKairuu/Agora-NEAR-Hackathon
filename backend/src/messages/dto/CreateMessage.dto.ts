import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMessage {
    @IsNotEmpty({ message: 'Write a message' })
    @IsString({ message: 'Message must be text' })
    @MaxLength(4000, { message: 'Message must be at most 4000 characters' })
    text!: string;
}
