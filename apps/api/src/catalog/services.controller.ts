import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { ServiceDto } from '@alconst/shared';
import { Client, CurrentAuth, Roles } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { CreateServiceDto, UpdateServiceDto } from './dto/services.dto.js';
import { ServicesService } from './services.service.js';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  /** Catalogul este vizibil tuturor: angajații aleg din el serviciile clienților lor. */
  @Get()
  list(): Promise<ServiceDto[]> {
    return this.services.list();
  }

  @Roles('ADMIN')
  @Post()
  create(
    @Body() dto: CreateServiceDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ServiceDto> {
    return this.services.create(dto, auth, client);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ServiceDto> {
    return this.services.update(id, dto, auth, client);
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.services.remove(id, auth, client);
  }
}
