import { Module } from '@nestjs/common';
import { ClientAccessService } from './client-access.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

/** Clienții și tot ce ține de ei: responsabili, puncte de lucru, angajați, contracte. */
@Module({
  controllers: [ClientsController, LocationsController, EmployeesController, ContractsController],
  providers: [
    ClientAccessService,
    ClientsService,
    LocationsService,
    EmployeesService,
    ContractsService,
  ],
  exports: [ClientAccessService],
})
export class ClientsModule {}
