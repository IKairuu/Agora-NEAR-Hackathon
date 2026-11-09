import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateSpecTestFile {
    @IsNotEmpty({ message: 'Test file path is required' })
    @IsString({ message: 'Test file path must be text' })
    @Matches(/^(?!\/)(?!.*\.\.)[\w./-]+$/, { message: 'Test file path must be relative to the repo' })
    path!: string;

    @IsNotEmpty({ message: 'Test file content is required' })
    @IsString({ message: 'Test file content must be text' })
    @MaxLength(200000, { message: 'Test file content must be at most 200000 characters' })
    content!: string;
}
