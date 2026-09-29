import { IsEmail, IsString, MaxLength, MinLength, IsOptional } from 'class-validator';

export class TestSignInDto {
  @IsString() @MinLength(1) @MaxLength(100)
  googleAccountId!: string;

  @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  returnPath?: string;
}
