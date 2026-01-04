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

export class OrderItemDto {
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

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  packPrice: number;

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

  @IsOptional()
  @IsString()
  packLabel?: string;

  @IsOptional()
  @IsNumber()
  packQuantity?: number;
}

export class CreateOrderDto {
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
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

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

export class UpdateOrderStatusDto {
  @IsString()
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class UpdatePaymentStatusDto {
  @IsString()
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';

  @IsOptional()
  @IsString()
  paymentReference?: string;
}
