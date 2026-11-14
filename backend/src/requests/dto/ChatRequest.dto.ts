import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ChatTurn {
    @IsIn(['user', 'agent'], { message: 'Each message is from the user or the agent' })
    role!: 'user' | 'agent';

    @IsString({ message: 'A message must be text' })
    @MaxLength(4000, { message: 'A message must be at most 4000 characters' })
    text!: string;
}

/** The New request conversation so far, oldest first. The last message is the user's. */
export class ChatRequest {
    @IsArray({ message: 'Messages must be a list' })
    @ArrayMinSize(1, { message: 'Send a message first' })
    @ArrayMaxSize(60, { message: 'This conversation is too long. Start a new request.' })
    @ValidateNested({ each: true })
    @Type(() => ChatTurn)
    messages!: ChatTurn[];
}
