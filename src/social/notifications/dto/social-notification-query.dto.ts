import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SocialNotificationQueryDto {
  @IsOptional()
  @IsIn(['all', 'unread'])
  filter?: 'all' | 'unread';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

