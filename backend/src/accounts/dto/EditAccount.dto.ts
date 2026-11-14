import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CreateAccount } from './CreateAccount.dto.js';

/** A profile photo the browser already resized: a base64 data URL, or '' to remove the photo. */
export const AVATAR_DATA_URL = /^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2})?$/;
export const AVATAR_MAX_LENGTH = 90_000;

export class EditAccount extends CreateAccount {
    @IsOptional()
    @IsString({ message: 'Photo must be text' })
    @MaxLength(AVATAR_MAX_LENGTH, { message: 'Photo is too large. Use an image under about 60 KB.' })
    @Matches(AVATAR_DATA_URL, { message: 'Photo must be a JPEG, PNG or WebP image' })
    avatar?: string;
}
