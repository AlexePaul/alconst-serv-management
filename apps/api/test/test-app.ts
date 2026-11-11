import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { MailJobData, UserRole } from '@alconst/shared';
import { AppModule } from '../src/app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { MailQueueService } from '../src/mail/mail-queue.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'parola-de-test-123';

/** Înlocuiește coada de email cu una în memorie, pentru a putea inspecta mesajele trimise. */
class FakeMailQueue {
  readonly sent: MailJobData[] = [];

  enqueue(data: MailJobData): Promise<void> {
    this.sent.push(data);
    return Promise.resolve();
  }

  ping(): Promise<void> {
    return Promise.resolve();
  }
}

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  mail: FakeMailQueue;
  http: () => ReturnType<typeof request>;
  reset: () => Promise<void>;
  createUser: (overrides?: {
    email?: string;
    role?: UserRole;
    isActive?: boolean;
    mustChangePassword?: boolean;
    firstName?: string;
    lastName?: string;
  }) => Promise<{ id: string; email: string }>;
  /** Autentifică utilizatorul și întoarce cookie-ul de sesiune. */
  login: (email: string, password?: string) => Promise<string>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const mail = new FakeMailQueue();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailQueueService)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_CREATE_OPTIONS);
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const http = () => request(app.getHttpServer());

  return {
    app,
    prisma,
    mail,
    http,
    async reset() {
      mail.sent.length = 0;
      await prisma.db.$executeRawUnsafe(
        'TRUNCATE TABLE "activity_logs", "password_reset_tokens", "sessions", "client_transfer_requests", "notifications", "tasks", "obligations", "clients", "services", "users", "worker_heartbeats" CASCADE',
      );
    },
    async createUser(overrides = {}) {
      const user = await prisma.db.user.create({
        data: {
          email: overrides.email ?? 'admin@test.ro',
          firstName: overrides.firstName ?? 'Ana',
          lastName: overrides.lastName ?? 'Test',
          role: overrides.role ?? 'ADMIN',
          isActive: overrides.isActive ?? true,
          mustChangePassword: overrides.mustChangePassword ?? false,
          passwordHash: await hashPassword(PASSWORD),
        },
      });
      return { id: user.id, email: user.email };
    },
    async login(email, password = PASSWORD) {
      const response = await http()
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password })
        .expect(200);
      const cookie = response.get('Set-Cookie')?.[0]?.split(';')[0];
      if (!cookie) throw new Error('Login-ul nu a setat cookie-ul de sesiune');
      return cookie;
    },
    close: () => app.close(),
  };
}

/** Așteaptă până când condiția devine adevărată (pentru operațiunile procesate în fundal). */
export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Condiția nu a fost îndeplinită la timp');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
