import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsUUID } from 'class-validator';
import {
  IsOptionalText,
  IsTrimmedText,
  NULL_IS_A_VALUE,
  IsOptionalNotNull,
} from '../../common/dto-decorators.js';

export class CreateLocationDto {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;

  @IsTrimmedText('Denumirea', 200)
  name: string;

  @IsOptionalText('Adresa', 500)
  address?: string | null;

  @IsOptionalText('Observațiile', 5000)
  notes?: string | null;

  @IsOptionalNotNull()
  @IsBoolean({ message: 'Statusul nu este valid.' })
  isActive?: boolean;
}

/** Punctul de lucru nu poate fi mutat la alt client. */
export class UpdateLocationDto extends PartialType(
  OmitType(CreateLocationDto, ['clientId']),
  NULL_IS_A_VALUE,
) {}

export class ListLocationsQuery {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;
}
