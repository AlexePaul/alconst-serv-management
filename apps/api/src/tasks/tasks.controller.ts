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
import type { Paginated, TaskDto, TaskHistoryEntryDto, TasksOverviewDto } from '@alconst/shared';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import {
  CreateTaskDto,
  ListTasksQuery,
  TasksOverviewQuery,
  UpdateTaskDto,
} from './dto/tasks.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @Query() query: ListTasksQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<TaskDto>> {
    return this.tasks.list(query, auth);
  }

  @Get('overview')
  overview(
    @Query() query: TasksOverviewQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TasksOverviewDto> {
    return this.tasks.overview(query.scope ?? 'mine', auth);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext): Promise<TaskDto> {
    return this.tasks.get(id, auth);
  }

  @Get(':id/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TaskHistoryEntryDto[]> {
    return this.tasks.history(id, auth);
  }

  @Post()
  create(
    @Body() dto: CreateTaskDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<TaskDto> {
    return this.tasks.create(dto, auth, client);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<TaskDto> {
    return this.tasks.update(id, dto, auth, client);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.tasks.remove(id, auth, client);
  }
}
