import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { createValidationPipe } from './common/validation.js';
import { AppConfig } from './config/app-config.js';

/** Opțiunile de creare a aplicației – parserul implicit este dezactivat pentru a accepta doar JSON. */
export const APP_CREATE_OPTIONS = { bodyParser: false } as const;

/**
 * Configurarea HTTP comună pentru rularea normală și pentru testele e2e.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  app.setGlobalPrefix('api');
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // Interfața poate fi găzduită separat de API (alt subdomeniu al aceluiași domeniu): resursele
  // API-ului pot fi cerute de pe același site, dar nu de pe alte site-uri.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  // Singura origine acceptată este cea a interfeței (APP_URL), cu cookie-ul de sesiune.
  // Când interfața și API-ul sunt pe aceeași origine, regula nu are niciun efect.
  app.enableCors({
    origin: config.appUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 600,
  });
  // Doar JSON: formularele clasice (urlencoded/multipart) nu sunt acceptate implicit,
  // ceea ce elimină o clasă întreagă de atacuri CSRF.
  app.useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  // Răspunsurile API conțin date personale și nu trebuie păstrate în cache-uri.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
