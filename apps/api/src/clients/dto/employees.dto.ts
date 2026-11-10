import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsOptionalDateOnly, IsOptionalText, IsTrimmedText } from '../../common/dto-decorators.js';
import { PaginationQuery, STATUS_FILTERS, type StatusFilter } from '../../common/pagination.js';

export class CreateEmployeeDto {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;

  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID('all', { message: 'Punct de lucru invalid.' })
  locationId?: string | null;

  @IsTrimmedText('Prenumele', 100)
  firstName: string;

  @IsTrimmedText('Numele', 100)
  lastName: string;

  @IsOptionalText('Funcția', 200)
  position?: string | null;

  @IsOptionalDateOnly('Data angajării')
  hireDate?: string | null;

  @IsOptionalText('Observațiile', 5000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'Statusul nu este valid.' })
  isActive?: boolean;
}

/** Angajatul nu poate fi mutat la alt client. */
export class UpdateEmployeeDto extends PartialType(OmitType(CreateEmployeeDto, ['clientId'])) {}

export class ListEmployeesQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: StatusFilter;

  @IsOptional()
  @IsUUID('all')
  clientId?: string;

  @IsOptional()
  @IsUUID('all')
  locationId?: string;
}
