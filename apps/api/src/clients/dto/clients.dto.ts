import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CUI_PATTERN, MAX_EMPLOYEE_COUNT, normalizeCui } from '@alconst/shared';
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

  /** Câți angajați are clientul. Doar numărul – aplicația nu ține evidența persoanelor. */
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsOptional()
  @IsInt({ message: 'Numărul de angajați trebuie să fie un număr întreg.' })
  @Min(0, { message: 'Numărul de angajați nu poate fi negativ.' })
  @Max(MAX_EMPLOYEE_COUNT, { message: 'Numărul de angajați este prea mare.' })
  employeeCount?: number | null;

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

/** Predarea definitivă a unui client de la un responsabil la altul. */
export class TransferClientDto {
  @IsUUID('all', { message: 'Responsabil invalid.' })
  fromUserId: string;

  @IsUUID('all', { message: 'Responsabil invalid.' })
  toUserId: string;
}
