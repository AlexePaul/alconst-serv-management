import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
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
import {
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskKind,
  type TaskPriority,
  type TaskStatus,
} from '@alconst/shared';
import {
  IsDateOnly,
  IsOptionalText,
  IsOptionalTime,
  IsTrimmedText,
} from '../../common/dto-decorators.js';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateTaskDto {
  @IsTrimmedText('Titlul', 200)
  title: string;

  @IsOptionalText('Descrierea', 5000)
  description?: string | null;

  @IsOptionalText('Observațiile', 5000)
  notes?: string | null;

  @IsOptional()
  @IsIn(TASK_KINDS, { message: 'Tipul nu este valid.' })
  kind?: TaskKind;

  @IsOptional()
  @IsIn(TASK_PRIORITIES, { message: 'Prioritatea nu este validă.' })
  priority?: TaskPriority;

  @IsOptional()
  @IsIn(TASK_STATUSES, { message: 'Statusul nu este valid.' })
  status?: TaskStatus;

  @IsDateOnly('Termenul')
  dueDate: string;

  @IsOptionalTime('Ora de început')
  startTime?: string | null;

  @IsOptionalTime('Ora de sfârșit')
  endTime?: string | null;

  /** Doar pentru deplasări: confirmă că fișele au fost completate. */
  @IsOptional()
  @IsBoolean({ message: 'Valoare invalidă.' })
  sheetsCompleted?: boolean;

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
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

/** `missing-sheets` = deplasări finalizate fără confirmarea completării fișelor. */
export const TASK_STATUS_FILTERS = ['open', 'done', 'cancelled', 'missing-sheets', 'all'] as const;
export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

export class ListTasksQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(TASK_STATUS_FILTERS)
  status?: TaskStatusFilter;

  /** `me` = task-urile mele, `none` = fără responsabil, altfel ID-ul unui utilizator. */
  @IsOptional()
  @Matches(/^(me|none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  assignee?: string;

  @IsOptional()
  @IsUUID('all')
  clientId?: string;

  @IsOptional()
  @IsUUID('all')
  obligationId?: string;

  @IsOptional()
  @IsIn(TASK_KINDS)
  kind?: TaskKind;

  /** Începutul intervalului de termene (inclusiv). */
  @IsOptional()
  @IsDateOnly('Data')
  from?: string;

  /** Sfârșitul intervalului de termene (inclusiv). */
  @IsOptional()
  @IsDateOnly('Data')
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Calendarul încarcă toate task-urile dintr-o lună, de aceea limita este mai mare. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}

export class TasksOverviewQuery {
  /** `mine` = doar task-urile atribuite mie; `all` = toate cele la care am acces. */
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';
}
