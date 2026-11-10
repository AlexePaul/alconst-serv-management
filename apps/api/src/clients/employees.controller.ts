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
import type { ClientEmployeeDto, Paginated } from '@alconst/shared';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { CreateEmployeeDto, ListEmployeesQuery, UpdateEmployeeDto } from './dto/employees.dto.js';
import { EmployeesService } from './employees.service.js';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(
    @Query() query: ListEmployeesQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<ClientEmployeeDto>> {
    return this.employees.list(query, auth);
  }

  @Post()
  create(
    @Body() dto: CreateEmployeeDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientEmployeeDto> {
    return this.employees.create(dto, auth, client);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientEmployeeDto> {
    return this.employees.update(id, dto, auth, client);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.employees.remove(id, auth, client);
  }
}
