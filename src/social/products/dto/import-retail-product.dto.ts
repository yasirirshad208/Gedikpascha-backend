import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ImportRetailProductDto {
  @IsNotEmpty()
  @IsUUID('4')
  retailOrderItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  resalePrice?: number;

  @IsOptional()
  @IsIn(['like_new', 'good', 'fair'])
  condition?: 'like_new' | 'good' | 'fair';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

