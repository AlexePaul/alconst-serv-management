import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '@alconst/shared';
import { IsNewPassword, IsNormalizedEmail } from '../../common/dto-decorators.js';

export class LoginDto {
  @IsNormalizedEmail()
  email: string;

  @IsString({ message: 'Parola este obligatorie.' })
  @MinLength(1, { message: 'Parola este obligatorie.' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Parola este prea lungă.' })
  password: string;
}

export class ChangePasswordDto {
  @IsString({ message: 'Parola curentă este obligatorie.' })
  @MinLength(1, { message: 'Parola curentă este obligatorie.' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Parola este prea lungă.' })
  currentPassword: string;

  @IsNewPassword()
  newPassword: string;
}

export class ForgotPasswordDto {
  @IsNormalizedEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString({ message: 'Linkul de resetare nu este valid.' })
  @MinLength(20, { message: 'Linkul de resetare nu este valid.' })
  @MaxLength(200, { message: 'Linkul de resetare nu este valid.' })
  token: string;

  @IsNewPassword()
  newPassword: string;
}
