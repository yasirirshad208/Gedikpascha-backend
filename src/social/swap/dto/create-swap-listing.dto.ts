import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSwapListingDto {
  @IsNotEmpty()
  @IsUUID('4')
  offeredProductId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNotEmpty()
  @IsString()
  wantedCategory!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  wantedDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wantedAlternatives?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  wantedMinValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wantedMaxValue?: number;

  @IsOptional()
  @IsBoolean()
  cashTopUpAllowed?: boolean;
}

