import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExplainBid {
    @IsNotEmpty({ message: 'Explain why the offer is fair' })
    @IsString({ message: 'Explanation must be text' })
    @MaxLength(1000, { message: 'Explanation must be at most 1000 characters' })
    explanation!: string;
}
