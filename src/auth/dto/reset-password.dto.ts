import { IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class ResetPasswordDto {
  @IsOptional()
  token?: string;

  @IsOptional()
  refreshToken?: string;

  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}

