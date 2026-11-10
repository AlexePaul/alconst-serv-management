import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { USER_ROLES, type UserRole } from '@alconst/shared';
import { IsNewPassword, IsNormalizedEmail, IsTrimmedText } from '../../common/dto-decorators.js';

export class CreateUserDto {
  @IsNormalizedEmail()
  email: string;

  @IsTrimmedText('Prenumele', 100)
  firstName: string;

  @IsTrimmedText('Numele', 100)
  lastName: string;

  @IsIn(USER_ROLES, { message: 'Rolul selectat nu este valid.' })
  role: UserRole;

  /** Parolă temporară; utilizatorul este obligat să o schimbe la prima autentificare. */
  @IsNewPassword()
  password: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsNormalizedEmail()
  email?: string;

  @IsOptional()
  @IsTrimmedText('Prenumele', 100)
  firstName?: string;

  @IsOptional()
  @IsTrimmedText('Numele', 100)
  lastName?: string;

  @IsOptional()
  @IsIn(USER_ROLES, { message: 'Rolul selectat nu este valid.' })
  role?: UserRole;

  @IsOptional()
  @IsBoolean({ message: 'Statusul contului nu este valid.' })
  isActive?: boolean;
}

export class AdminResetPasswordDto {
  /** Parolă temporară; utilizatorul este obligat să o schimbe la următoarea autentificare. */
  @IsNewPassword()
  password: string;
}
