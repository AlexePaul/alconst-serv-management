import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module.js';
import { ObligationsController } from './obligations.controller.js';
import { ObligationsService } from './obligations.service.js';
import { TaskAccessService } from './task-access.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

/** Obligații recurente și task-uri. */
@Module({
  imports: [ClientsModule],
  controllers: [ObligationsController, TasksController],
  providers: [TaskAccessService, ObligationsService, TasksService],
})
export class TasksModule {}
