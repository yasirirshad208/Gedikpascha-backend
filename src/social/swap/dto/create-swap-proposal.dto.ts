import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateSwapProposalDto {
  @IsNotEmpty()
  @IsUUID('4')
  offeredProductId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashTopUp?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

