import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CUI_PATTERN, normalizeCui } from '@alconst/shared';
import { IsOptionalEmail, IsOptionalText, IsTrimmedText } from '../../common/dto-decorators.js';
import { PaginationQuery, STATUS_FILTERS, type StatusFilter } from '../../common/pagination.js';

export class CreateClientDto {
  @IsTrimmedText('Denumirea', 200)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeCui(value) : value,
  )
  @Matches(CUI_PATTERN, {
    message: 'CUI-ul trebuie să conțină 2–10 cifre, opțional cu prefixul RO.',
  })
  cui: string;

  @IsOptionalText('Nr. Registrul Comerțului', 50)
  tradeRegisterNumber?: string | null;

  @IsOptionalText('Adresa', 500)
  address?: string | null;

  @IsOptionalText('Persoana de contact', 200)
  contactPerson?: string | null;

  @IsOptionalEmail()
  email?: string | null;

  @IsOptionalText('Telefonul', 50)
  phone?: string | null;

  @IsOptionalText('Reprezentantul legal', 200)
  legalRepresentative?: string | null;

  @IsOptionalText('Observațiile', 5000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'Statusul nu este valid.' })
  isActive?: boolean;

  /** Responsabilii clientului. Doar administratorii îi pot stabili; un angajat devine automat responsabil. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true, message: 'Responsabil invalid.' })
  responsibleIds?: string[];
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class ListClientsQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: StatusFilter;

  /** Filtru după responsabil (doar pentru administratori). */
  @IsOptional()
  @IsUUID('all')
  responsibleId?: string;
}

export class SetResponsiblesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true, message: 'Responsabil invalid.' })
  userIds: string[];
}

export class SetClientServicesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true, message: 'Serviciu invalid.' })
  serviceIds: string[];
}
