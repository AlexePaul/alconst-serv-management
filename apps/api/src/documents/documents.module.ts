import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module.js';
import { AppConfig } from '../config/app-config.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { createFileStorage, FILE_STORAGE } from './file-storage.js';

/** Secțiunea de documente: dosare și fișiere încărcate, pe client și generale. */
@Module({
  imports: [ClientsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      provide: FILE_STORAGE,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createFileStorage(config.files),
    },
  ],
})
export class DocumentsModule {}
