import { Global, Module } from '@nestjs/common';
import { AppConfig, loadAppConfig } from './app-config.js';

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => loadAppConfig() }],
  exports: [AppConfig],
})
export class ConfigModule {}
