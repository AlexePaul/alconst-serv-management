import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { IsOptionalText, IsTrimmedText } from '../../common/dto-decorators.js';

export class CreateLocationDto {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;

  @IsTrimmedText('Denumirea', 200)
  name: string;

  @IsOptionalText('Adresa', 500)
  address?: string | null;

  @IsOptionalText('Observațiile', 5000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'Statusul nu este valid.' })
  isActive?: boolean;
}

/** Punctul de lucru nu poate fi mutat la alt client. */
export class UpdateLocationDto extends PartialType(OmitType(CreateLocationDto, ['clientId'])) {}

export class ListLocationsQuery {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;
}
