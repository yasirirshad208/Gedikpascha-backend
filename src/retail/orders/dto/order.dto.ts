import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEmail,
  IsArray,
  ValidateNested,
  IsObject,
  MinLength,
  MaxLength,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ShippingAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class BillingAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class RetailOrderItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  // Snapshot data
  @IsString()
  productName: string;

  @IsOptional()
  @IsString()
  productSlug?: string;

  @IsOptional()
  @IsString()
  productImage?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  // Variation data
  @IsOptional()
  @IsString()
  combinationKey?: string;

  @IsOptional()
  @IsObject()
  variationDetails?: Record<string, any>;

  @IsOptional()
  @IsString()
  colorValue?: string;

  @IsOptional()
  @IsString()
  sizeValue?: string;
}

export class CreateRetailOrderDto {
  // Customer information
  @IsEmail()
  customerEmail: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  customerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerPhone?: string;

  // Shipping address
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  // Billing address
  @IsBoolean()
  billingSameAsShipping: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BillingAddressDto)
  billingAddress?: BillingAddressDto;

  // Order items
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RetailOrderItemDto)
  items: RetailOrderItemDto[];

  // Totals (calculated on client, verified on server)
  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsNumber()
  @Min(0)
  totalAmount: number;

  // Additional info
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Payment method (for future use)
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

export class UpdateRetailOrderStatusDto {
  @IsString()
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class UpdateRetailPaymentStatusDto {
  @IsString()
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';

  @IsOptional()
  @IsString()
  paymentReference?: string;
}
