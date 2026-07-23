import {
  IsUUID,
  IsOptional,
  IsNumber,
  IsInt,
  IsString,
  Min,
  Max,
  IsEnum,
} from 'class-validator';

/**
 * Payload for importing one of the user's OWN wholesale products into their
 * OWN retail store (cross-listing their catalog, not a purchase-based import).
 *
 * Pack rule: wholesale products are sold in packs. When a pack is chosen, the
 * retail listing receives `numberOfPacks * pack.quantity` single units — a pack
 * of 10 imported once becomes 10 sellable retail units. A single unit cannot be
 * imported from a pack-based product. Products with no packs import as plain
 * single units via `quantity`.
 */
export class ImportFromWholesaleDto {
  @IsUUID()
  wholesaleProductId: string;

  // Which pack size to import. Required when the product has pack sizes.
  @IsOptional()
  @IsUUID()
  packSizeId?: string;

  // How many packs to import (pack-based products). Total units = packs * pack.quantity.
  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPacks?: number;

  // How many single units to import (products with no packs).
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  // Retail selling price per single unit. Must be >= unit cost (validated in service).
  @IsNumber()
  @Min(0)
  retailPrice: number;

  // Optional overrides — otherwise inherited from the wholesale product.
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  salePercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsEnum(['draft', 'active'])
  status?: 'draft' | 'active';
}
