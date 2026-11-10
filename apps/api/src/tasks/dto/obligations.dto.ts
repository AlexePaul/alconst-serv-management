import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  RECURRENCE_UNITS,
  type RecurrenceUnit,
  TASK_KINDS,
  TASK_PRIORITIES,
  type TaskKind,
  type TaskPriority,
} from '@alconst/shared';
import {
  IsDateOnly,
  IsOptionalDateOnly,
  IsOptionalText,
  IsOptionalTime,
  IsTrimmedText,
} from '../../common/dto-decorators.js';
import { PaginationQuery, STATUS_FILTERS, type StatusFilter } from '../../common/pagination.js';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateObligationDto {
  @IsTrimmedText('Titlul', 200)
  title: string;

  @IsOptionalText('Descrierea', 5000)
  description?: string | null;

  @IsOptional()
  @IsIn(TASK_KINDS, { message: 'Tipul nu este valid.' })
  kind?: TaskKind;

  @IsOptional()
  @IsIn(TASK_PRIORITIES, { message: 'Prioritatea nu este validă.' })
  priority?: TaskPriority;

  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Client invalid.' })
  clientId?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Punct de lucru invalid.' })
  locationId?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Responsabil invalid.' })
  assigneeId?: string | null;

  @IsIn(RECURRENCE_UNITS, { message: 'Frecvența nu este validă.' })
  recurrenceUnit: RecurrenceUnit;

  @IsOptional()
  @IsInt({ message: 'Intervalul trebuie să fie un număr întreg.' })
  @Min(1, { message: 'Intervalul trebuie să fie cel puțin 1.' })
  @Max(120, { message: 'Intervalul este prea mare.' })
  recurrenceInterval?: number;

  @IsDateOnly('Primul termen')
  startDate: string;

  @IsOptionalDateOnly('Data de sfârșit')
  endDate?: string | null;

  /**
   * Termen flexibil: poate fi făcută oricând în luna (sau săptămâna) în care cade termenul.
   * Implicit activ.
   */
  @IsOptional()
  @IsBoolean({ message: 'Opțiunea pentru termen flexibil nu este validă.' })
  dueWithinPeriod?: boolean;

  @IsOptionalTime('Ora de început')
  startTime?: string | null;

  @IsOptionalTime('Ora de sfârșit')
  endTime?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'Statusul nu este valid.' })
  isActive?: boolean;
}

export class UpdateObligationDto extends PartialType(CreateObligationDto) {}

export class ListObligationsQuery extends PaginationQuery {
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
}
