import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSocialReelDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(280)
  caption!: string;

  @IsNotEmpty()
  @IsString()
  reelUrl!: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  taggedProductIds?: string[];
}

