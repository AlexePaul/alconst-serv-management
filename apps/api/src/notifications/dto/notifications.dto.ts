import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_REMIND_DAYS_BEFORE } from '@alconst/shared';
import { PaginationQuery } from '../../common/pagination.js';

export class ListNotificationsQuery extends PaginationQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean({ message: 'Valoare invalidă.' })
  emailEnabled?: boolean;

  @IsOptional()
  @IsInt({ message: 'Numărul de zile trebuie să fie întreg.' })
  @Min(0, { message: 'Numărul de zile nu poate fi negativ.' })
  @Max(MAX_REMIND_DAYS_BEFORE, { message: `Cel mult ${MAX_REMIND_DAYS_BEFORE} de zile.` })
  remindDaysBefore?: number;
}
