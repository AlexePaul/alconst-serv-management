import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { UserDto, UserOptionDto } from '@alconst/shared';
import { Client, CurrentAuth, Roles } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { AdminResetPasswordDto, CreateUserDto, UpdateUserDto } from './dto/users.dto.js';
import { toUserDto } from './user.mapper.js';
import { UsersService } from './users.service.js';

/** Administrarea utilizatorilor – exclusiv pentru administratori. */
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(): Promise<UserDto[]> {
    return (await this.users.list()).map(toUserDto);
  }

  /** Lista scurtă a utilizatorilor activi, pentru alegerea responsabililor unui client. */
  @Get('options')
  async options(): Promise<UserOptionDto[]> {
    const users = await this.users.list();
    return users
      .filter((user) => user.isActive)
      .map(({ id, firstName, lastName, role }) => ({ id, firstName, lastName, role }));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return toUserDto(await this.users.get(id));
  }

  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<UserDto> {
    return toUserDto(await this.users.create(dto, auth, client));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<UserDto> {
    return toUserDto(await this.users.update(id, dto, auth, client));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<UserDto> {
    return toUserDto(await this.users.resetPassword(id, dto.password, auth, client));
  }
}
