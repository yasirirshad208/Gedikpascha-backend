import { IsNotEmpty, IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterRetailBrandDto {
  @IsNotEmpty({ message: 'Brand name is required' })
  @IsString()
  @MinLength(2, { message: 'Brand name must be at least 2 characters' })
  @MaxLength(100, { message: 'Brand name must be less than 100 characters' })
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'Brand name can only contain lowercase letters, numbers, hyphens, and underscores. No spaces allowed.',
  })
  brandName: string;

  @IsNotEmpty({ message: 'Display name is required' })
  @IsString()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(100, { message: 'Display name must be less than 100 characters' })
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be less than 500 characters' })
  description?: string;

  @IsNotEmpty({ message: 'Country is required' })
  @IsString()
  country: string;

  @IsNotEmpty({ message: 'Contact email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  contactEmail: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
