import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { SessionAuthGuard } from './auth/session-auth.guard.js';
import { CsrfOriginGuard } from './common/csrf-origin.guard.js';
import { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { MailQueueModule } from './mail/mail-queue.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        // Limită generală per IP; rutele de autentificare au limite mai stricte.
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        skipIf: () => config.nodeEnv === 'test',
      }),
    }),
    MailQueueModule,
    ActivityModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    ClientsModule,
    TasksModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordinea contează: limitare de trafic → CSRF → autentificare → roluri.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
