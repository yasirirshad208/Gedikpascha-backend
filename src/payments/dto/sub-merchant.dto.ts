import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export type SubMerchantBrandScope = 'wholesale_brand' | 'retail_brand' | 'social_user';
export type SubMerchantType =
  | 'PERSONAL'
  | 'PRIVATE_COMPANY'
  | 'LIMITED_OR_JOINT_STOCK_COMPANY';

export class OnboardSubMerchantDto {
  @IsIn(['wholesale_brand', 'retail_brand', 'social_user'])
  brandScope: SubMerchantBrandScope;

  /** Required for wholesale_brand / retail_brand; ignored for social_user. */
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsIn(['PERSONAL', 'PRIVATE_COMPANY', 'LIMITED_OR_JOINT_STOCK_COMPANY'])
  subMerchantType: SubMerchantType;

  /** Required for PRIVATE_COMPANY / LIMITED_OR_JOINT_STOCK_COMPANY. */
  @IsOptional() @IsString() @MaxLength(255) legalCompanyTitle?: string;
  @IsOptional() @IsString() @MaxLength(100) taxOffice?: string;
  @IsOptional() @IsString() @MaxLength(50) taxNumber?: string;

  /** Required for PERSONAL (TC kimlik). */
  @IsOptional() @Matches(/^\d{11}$/, { message: 'identityNumber must be 11 digits' })
  identityNumber?: string;

  @IsString() @IsNotEmpty()
  @Matches(/^TR\d{2}\d{20}$|^TR\d{24}$/, {
    message: 'IBAN must be a valid Turkish IBAN starting with TR followed by 24 digits.',
  })
  iban: string;

  @IsString() @IsNotEmpty() contactName: string;
  @IsString() @IsNotEmpty() contactSurname: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() gsmNumber?: string;
  @IsString() @IsNotEmpty() address: string;
}
