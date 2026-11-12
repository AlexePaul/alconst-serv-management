import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsUUID } from 'class-validator';
import { IsOptionalEmail, IsOptionalText, IsTrimmedText } from '../../common/dto-decorators.js';

export class CreateContactDto {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;

  @IsTrimmedText('Rolul', 100)
  label: string;

  @IsOptionalText('Numele', 200)
  name?: string | null;

  @IsOptionalText('Telefonul', 50)
  phone?: string | null;

  @IsOptionalEmail()
  email?: string | null;

  @IsOptionalText('Observațiile', 1000)
  notes?: string | null;
}

/** Contactul nu poate fi mutat la alt client. */
export class UpdateContactDto extends PartialType(OmitType(CreateContactDto, ['clientId'])) {}

export class ListContactsQuery {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;
}
