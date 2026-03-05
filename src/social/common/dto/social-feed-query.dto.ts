import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class SocialFeedQueryDto {
  @IsOptional()
  @IsIn(['all', 'posts', 'reels', 'closet'])
  mode?: 'all' | 'posts' | 'reels' | 'closet';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  cursor?: string;
}

