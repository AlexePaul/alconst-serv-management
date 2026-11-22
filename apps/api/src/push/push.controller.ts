import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { PushConfigDto } from '@alconst/shared';
import { CurrentAuth } from '../common/decorators.js';
import type { AuthContext } from '../common/request-context.js';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push.dto.js';
import { PushService } from './push.service.js';

/** Fiecare utilizator își gestionează doar propriile dispozitive. */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  config(@CurrentAuth() auth: AuthContext): Promise<PushConfigDto> {
    return this.push.config(auth.user.id);
  }

  @Post('subscribe')
  subscribe(
    @Body() dto: SubscribePushDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PushConfigDto> {
    return this.push.subscribe(auth.user.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unsubscribe')
  unsubscribe(
    @Body() dto: UnsubscribePushDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PushConfigDto> {
    return this.push.unsubscribe(auth.user.id, dto.endpoint);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('test')
  test(@CurrentAuth() auth: AuthContext): Promise<void> {
    return this.push.sendTest(auth.user.id);
  }
}
