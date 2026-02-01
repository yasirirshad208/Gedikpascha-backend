import {
  IsUUID,
  IsArray,
  IsString,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExchangeItemDto {
  @IsUUID()
  productId: string;

  @IsString()
  productName: string;

  @IsString()
  @IsOptional()
  productImageUrl?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  totalPrice: number;

  @IsOptional()
  variationDetails?: any;
}

export class CreateExchangeDto {
  @IsUUID()
  receiverId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExchangeItemDto)
  initiatorItems: ExchangeItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExchangeItemDto)
  receiverItems: ExchangeItemDto[];

  @IsUUID()
  initiatorAddressId: string;

  @IsUUID()
  @IsOptional()
  receiverAddressId?: string;

  @IsString()
  @IsOptional()
  initiatorNotes?: string;

  @IsNumber()
  @IsOptional()
  priceDifference?: number;
}
