import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SocialReelQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

