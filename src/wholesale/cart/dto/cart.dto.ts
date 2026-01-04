import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsObject,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddToCartDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  packSizeId?: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsObject()
  selectedVariations?: Record<string, number>; // { "color:Red|size:M": 5, "color:Blue|size:L": 7 }

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packPrice?: number;
}

export class UpdateCartItemDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsObject()
  selectedVariations?: Record<string, number>;
}

export class CartItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  packSizeId?: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsObject()
  selectedVariations?: Record<string, number>;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  packPrice?: number;
}

export class SyncCartDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}

export class RemoveFromCartDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  packSizeId?: string;
}
