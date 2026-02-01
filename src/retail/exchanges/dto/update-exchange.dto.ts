import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateExchangeStatusDto {
  @IsString()
  @IsIn(['approved', 'rejected', 'cancelled', 'shipped', 'delivered', 'completed'])
  status: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @IsString()
  @IsOptional()
  cancellationReason?: string;
}

export class UpdateDeliveryStatusDto {
  @IsString()
  @IsIn(['pending', 'shipped', 'in_transit', 'delivered', 'failed'])
  deliveryStatus: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;
}
