import { Module } from '@nestjs/common';
import { ClientAccessService } from './client-access.service.js';
import { ClientTransfersController } from './client-transfers.controller.js';
import { ClientTransfersService } from './client-transfers.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { ContactsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

/** Clienții și tot ce ține de ei: responsabili, persoane de contact, puncte de lucru, contracte. */
@Module({
  controllers: [
    ClientsController,
    ClientTransfersController,
    LocationsController,
    ContactsController,
    ContractsController,
  ],
  providers: [
    ClientAccessService,
    ClientsService,
    ClientTransfersService,
    LocationsService,
    ContactsService,
    ContractsService,
  ],
  exports: [ClientAccessService, ClientsService],
})
export class ClientsModule {}
