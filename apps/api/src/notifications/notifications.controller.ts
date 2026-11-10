import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { NotificationDto, NotificationSettingsDto, Paginated } from '@alconst/shared';
import { CurrentAuth } from '../common/decorators.js';
import type { AuthContext } from '../common/request-context.js';
import { ListNotificationsQuery, UpdateNotificationSettingsDto } from './dto/notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Fiecare utilizator își vede și își gestionează doar propriile notificări. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query() query: ListNotificationsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<NotificationDto>> {
    return this.notifications.list(auth.user.id, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentAuth() auth: AuthContext): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(auth.user.id) };
  }

  @Get('settings')
  getSettings(@CurrentAuth() auth: AuthContext): Promise<NotificationSettingsDto> {
    return this.notifications.getSettings(auth.user.id);
  }

  @Put('settings')
  updateSettings(
    @Body() dto: UpdateNotificationSettingsDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<NotificationSettingsDto> {
    return this.notifications.updateSettings(auth.user.id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('read-all')
  markAllRead(@CurrentAuth() auth: AuthContext): Promise<void> {
    return this.notifications.markAllRead(auth.user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    return this.notifications.markRead(id, auth.user.id);
  }
}
