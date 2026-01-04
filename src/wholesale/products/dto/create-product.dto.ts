import { IsString, IsOptional, IsNumber, IsBoolean, IsUUID, IsArray, IsObject, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductImageDto {
  @IsString()
  imageUrl: string;

  @IsNumber()
  @Min(0)
  displayOrder: number;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class ProductVariationDto {
  @IsString()
  variationType: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceOverride?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @IsBoolean()
  trackStock: boolean;

  @IsBoolean()
  isAvailable: boolean;

  @IsNumber()
  @Min(0)
  displayOrder: number;
}

export class PackVariationDto {
  @IsString()
  variationType: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  imageIndex?: number;

  @IsBoolean()
  isAvailable: boolean;

  @IsNumber()
  @Min(0)
  displayOrder: number;
}

export class ProductPackSizeDto {
  @IsString()
  label: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  packPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsBoolean()
  isPopular: boolean;

  @IsBoolean()
  isBestValue: boolean;

  @IsBoolean()
  isAvailable: boolean;

  @IsNumber()
  @Min(0)
  displayOrder: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackVariationDto)
  variations?: PackVariationDto[];

  @IsOptional()
  @IsObject()
  stockMatrix?: Record<string, number>;
}

export class CreateProductDto {
  // Basic Information
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  // Pricing
  @IsNumber()
  @Min(0)
  wholesalePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  salePercentage?: number;

  // MOQ
  @IsNumber()
  @Min(1)
  minOrderQuantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  // Inventory
  @IsNumber()
  @Min(0)
  stockQuantity: number;

  @IsBoolean()
  trackInventory: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  // Status
  @IsOptional()
  @IsEnum(['draft', 'active', 'inactive', 'archived'])
  status?: 'draft' | 'active' | 'inactive' | 'archived';

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsEnum(['new', 'used', 'refurbished'])
  condition?: 'new' | 'used' | 'refurbished';

  // Shipping
  @IsOptional()
  @IsString()
  shippingInfo?: string;

  @IsOptional()
  @IsBoolean()
  isShippingFree?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  estimatedDeliveryDays?: number;

  // Product details (flexible JSON object)
  @IsOptional()
  @IsObject()
  productDetails?: Record<string, any>;

  @IsOptional()
  @IsObject()
  sizeChart?: Record<string, any>;

  // SEO
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  metaKeywords?: string;

  // Related data
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariationDto)
  variations?: ProductVariationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPackSizeDto)
  packSizes?: ProductPackSizeDto[];
}

