import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig, loadRootEnvFile } from './config/app-config.js';

loadRootEnvFile();

// Modulele sunt importate după încărcarea variabilelor de mediu.
const { AppModule } = await import('./app.module.js');
const { APP_CREATE_OPTIONS, configureApp } = await import('./app.setup.js');

const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_CREATE_OPTIONS);
configureApp(app);

const config = app.get(AppConfig);
await app.listen(config.apiPort, config.apiHost);
new Logger('Bootstrap').log(
  `API pornit pe ${config.apiHost}:${config.apiPort} (${config.nodeEnv}, versiunea ${config.version})`,
);
