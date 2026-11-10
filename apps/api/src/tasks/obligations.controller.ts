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
  Query,
} from '@nestjs/common';
import type { ObligationDto, Paginated } from '@alconst/shared';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import {
  CreateObligationDto,
  ListObligationsQuery,
  UpdateObligationDto,
} from './dto/obligations.dto.js';
import { ObligationsService } from './obligations.service.js';

@Controller('obligations')
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get()
  list(
    @Query() query: ListObligationsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<ObligationDto>> {
    return this.obligations.list(query, auth);
  }

  @Post()
  create(
    @Body() dto: CreateObligationDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ObligationDto> {
    return this.obligations.create(dto, auth, client);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObligationDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ObligationDto> {
    return this.obligations.update(id, dto, auth, client);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.obligations.remove(id, auth, client);
  }
}
