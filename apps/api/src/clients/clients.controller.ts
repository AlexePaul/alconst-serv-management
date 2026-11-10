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
  Put,
  Query,
} from '@nestjs/common';
import type { ClientDto, ClientListItemDto, ClientsSummaryDto, Paginated } from '@alconst/shared';
import { Client, CurrentAuth, Roles } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { ClientsService } from './clients.service.js';
import {
  CreateClientDto,
  ListClientsQuery,
  SetClientServicesDto,
  SetResponsiblesDto,
  UpdateClientDto,
} from './dto/clients.dto.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(
    @Query() query: ListClientsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<ClientListItemDto>> {
    return this.clients.list(query, auth);
  }

  @Get('summary')
  summary(@CurrentAuth() auth: AuthContext): Promise<ClientsSummaryDto> {
    return this.clients.summary(auth);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ClientDto> {
    return this.clients.get(id, auth);
  }

  @Post()
  create(
    @Body() dto: CreateClientDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientDto> {
    return this.clients.create(dto, auth, client);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientDto> {
    return this.clients.update(id, dto, auth, client);
  }

  /** Ștergerea definitivă este rezervată administratorilor; angajații pot doar dezactiva. */
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.clients.remove(id, auth, client);
  }

  @Roles('ADMIN')
  @Put(':id/responsibles')
  setResponsibles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetResponsiblesDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientDto> {
    return this.clients.setResponsibles(id, dto.userIds, auth, client);
  }

  @Put(':id/services')
  setServices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetClientServicesDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientDto> {
    return this.clients.setServices(id, dto.serviceIds, auth, client);
  }
}
