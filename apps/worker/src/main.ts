import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadRootEnvFile } from './config/worker-config.js';

loadRootEnvFile();

// Modulele sunt importate după încărcarea variabilelor de mediu.
const { WorkerModule } = await import('./worker.module.js');

// Context fără server HTTP: worker-ul doar consumă job-uri din Redis.
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
new Logger('Bootstrap').log('Worker pornit – se așteaptă job-uri');
