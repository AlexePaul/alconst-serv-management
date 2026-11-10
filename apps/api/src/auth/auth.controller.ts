import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { UserDto } from '@alconst/shared';
import { AllowPendingPasswordChange, Client, CurrentAuth, Public } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { toUserDto } from '../users/user.mapper.js';
import { AuthService } from './auth.service.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth.dto.js';
import { SessionService } from './session.service.js';

const MINUTE = 60_000;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserDto> {
    const { user, token, expiresAt } = await this.auth.login(dto.email, dto.password, client);
    this.sessions.setCookie(response, token, expiresAt);
    return toUserDto(user);
  }

  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(auth, client);
    this.sessions.clearCookie(response);
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext): UserDto {
    return toUserDto(auth.user);
  }

  @AllowPendingPasswordChange()
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<UserDto> {
    const user = await this.auth.changePassword(auth, dto.currentPassword, dto.newPassword, client);
    return toUserDto(user);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Client() client: ClientInfo): void {
    // Răspundem imediat și identic indiferent dacă adresa există, iar procesarea continuă
    // în fundal – astfel nici timpul de răspuns nu dezvăluie ce conturi sunt înregistrate.
    this.auth.requestPasswordReset(dto.email, client).catch((error: unknown) => {
      this.logger.error(
        'Cererea de resetare a parolei nu a putut fi procesată',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Client() client: ClientInfo): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword, client);
  }
}
