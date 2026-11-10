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
import type { LocationDto } from '@alconst/shared';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { CreateLocationDto, ListLocationsQuery, UpdateLocationDto } from './dto/locations.dto.js';
import { LocationsService } from './locations.service.js';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(
    @Query() query: ListLocationsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<LocationDto[]> {
    return this.locations.list(query.clientId, auth);
  }

  @Post()
  create(
    @Body() dto: CreateLocationDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<LocationDto> {
    return this.locations.create(dto, auth, client);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<LocationDto> {
    return this.locations.update(id, dto, auth, client);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.locations.remove(id, auth, client);
  }
}
