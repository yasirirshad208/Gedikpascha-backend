import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type OrderScope = 'wholesale' | 'retail' | 'social' | 'swap';

export class CheckoutBuyerDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() surname: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() gsmNumber?: string;

  /**
   * TC kimlik number for individuals. For B2B buyers send "11111111111".
   * Required by Iyzico on every checkout (their validation, not ours).
   */
  @IsString() @IsNotEmpty() identityNumber: string;
}

export class CheckoutAddressDto {
  @IsString() @IsNotEmpty() contactName: string;
  @IsString() @IsNotEmpty() address: string;
  @IsString() @IsNotEmpty() city: string;
  @IsString() @IsNotEmpty() country: string;
  @IsOptional() @IsString() zipCode?: string;
}

export class CreateCheckoutDto {
  /**
   * Which segment created the order. Phase 1 only handles 'retail'.
   * Wholesale / social / swap arrive in later phases but the shape is the same.
   */
  @IsIn(['wholesale', 'retail', 'social', 'swap']) orderScope: OrderScope;

  /** Order ID in the segment-specific table (e.g. retail_orders.id). */
  @IsUUID() orderId: string;

  @IsNumber() @Min(0.01) amount: number;

  @IsOptional() @IsIn(['TRY', 'EUR', 'USD', 'GBP']) currency?: 'TRY' | 'EUR' | 'USD' | 'GBP';

  @ValidateNested() @Type(() => CheckoutBuyerDto) buyer: CheckoutBuyerDto;
  @ValidateNested() @Type(() => CheckoutAddressDto) shippingAddress: CheckoutAddressDto;
  @ValidateNested() @Type(() => CheckoutAddressDto) billingAddress: CheckoutAddressDto;

  /**
   * Acknowledgement of the three mandatory legal documents at checkout.
   * The backend records the values; the frontend enforces the UI gate.
   * Distance Sales acceptance only applies to B2C (retail) orders.
   */
  @IsOptional() acceptDistanceSalesContract?: boolean;
  acceptCommissionAndPayment: boolean;
  acceptKvkk: boolean;
}
