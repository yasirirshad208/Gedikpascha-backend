import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendSocialMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  message?: string;

  @IsOptional()
  @IsIn(['text', 'product_card', 'shipping_card', 'review_card', 'system'])
  messageType?: 'text' | 'product_card' | 'shipping_card' | 'review_card' | 'system';

  @IsOptional()
  metadata?: Record<string, unknown>;
}

