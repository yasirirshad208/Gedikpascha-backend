import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSwapShippingDto {
  @IsNotEmpty()
  @IsIn(['owner', 'proposer'])
  side!: 'owner' | 'proposer';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string;

  @IsNotEmpty()
  @IsIn(['pending', 'shipped', 'delivered'])
  status!: 'pending' | 'shipped' | 'delivered';
}

