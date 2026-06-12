import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type RefundReason =
  | 'buyer_request'
  | 'damaged'
  | 'wrong_item'
  | 'not_delivered'
  | 'double_payment'
  | 'fraud'
  | 'other';

/**
 * Admin / system-initiated refund of one or more splits on a transaction.
 * If `splitIds` is empty, the whole transaction is refunded.
 */
export class RefundTransactionDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  splitIds?: string[];

  /**
   * Explicit partial amount to refund. Ignored when splitIds are provided
   * (each split refunds its own net+fee). Used for ad-hoc partials on a
   * single-split / main-merchant transaction.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @IsIn([
    'buyer_request',
    'damaged',
    'wrong_item',
    'not_delivered',
    'double_payment',
    'fraud',
    'other',
  ])
  reason: RefundReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CancelTransactionDto {
  @IsIn([
    'buyer_request',
    'double_payment',
    'fraud',
    'other',
  ])
  reason: 'buyer_request' | 'double_payment' | 'fraud' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/**
 * Buyer-initiated request. For B2C this is the 14-day "cayma" (withdrawal).
 * Buyers cannot directly trigger an Iyzico refund — they open a request that
 * a seller or admin approves.
 */
export class CreateRefundRequestDto {
  @IsUUID()
  orderId: string;

  @IsIn(['wholesale', 'retail', 'social', 'swap'])
  orderScope: 'wholesale' | 'retail' | 'social' | 'swap';

  @IsIn(['buyer_request', 'damaged', 'wrong_item', 'not_delivered', 'other'])
  reason: 'buyer_request' | 'damaged' | 'wrong_item' | 'not_delivered' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn(['full', 'partial', 'withdrawal'])
  requestType: 'full' | 'partial' | 'withdrawal';

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  requestedAmount: number;
}

export class DecideRefundRequestDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class DisputeEvidenceItem {
  @IsIn(['invoice', 'shipping_proof', 'delivery_proof', 'correspondence', 'other'])
  evidenceType: 'invoice' | 'shipping_proof' | 'delivery_proof' | 'correspondence' | 'other';

  @IsString()
  @MaxLength(2048)
  fileUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UploadDisputeEvidenceDto {
  @IsUUID()
  transactionId: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DisputeEvidenceItem)
  evidence: DisputeEvidenceItem[];
}
