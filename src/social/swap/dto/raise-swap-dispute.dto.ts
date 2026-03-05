import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RaiseSwapDisputeDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(240)
  reason!: string;

  @IsString()
  @MaxLength(2000)
  details!: string;
}

