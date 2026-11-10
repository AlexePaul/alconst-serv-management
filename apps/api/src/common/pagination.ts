import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  get skip(): number {
    return ((this.page ?? 1) - 1) * this.take;
  }

  get take(): number {
    return this.pageSize ?? 25;
  }
}

export const STATUS_FILTERS = ['all', 'active', 'inactive'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Transformă filtrul de status în condiția Prisma corespunzătoare. */
export function statusWhere(status: StatusFilter | undefined): { isActive?: boolean } {
  if (status === 'active') return { isActive: true };
  if (status === 'inactive') return { isActive: false };
  return {};
}
