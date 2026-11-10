import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { ActivityLogDto } from '@alconst/shared';
import { Roles } from '../common/decorators.js';
import { ActivityService } from './activity.service.js';

class RecentActivityQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  /** Activitatea recentă. Conține evenimente de securitate, deci este rezervată administratorilor. */
  @Roles('ADMIN')
  @Get()
  recent(@Query() query: RecentActivityQuery): Promise<ActivityLogDto[]> {
    return this.activity.recent(query.limit ?? 20);
  }
}
