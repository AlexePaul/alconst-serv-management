import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { ContractDto } from '@alconst/shared';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { CreateContractDto, ListContractsQuery, UpdateContractDto } from './dto/contracts.dto.js';
import { ContractsService } from './contracts.service.js';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  list(
    @Query() query: ListContractsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ContractDto[]> {
    return this.contracts.list(query.clientId, auth);
  }

  @Post()
  create(
    @Body() dto: CreateContractDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ContractDto> {
    return this.contracts.create(dto, auth, client);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ContractDto> {
    return this.contracts.update(id, dto, auth, client);
  }
}
