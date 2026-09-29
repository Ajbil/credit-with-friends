import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from 'class-validator';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiConfig } from '../config/config.module';

function fieldErrors(errors: ValidationError[], parent = ''): Array<{ field: string; reason: string }> {
  return errors.flatMap(({ property, constraints, children }) => {
    const field = parent ? `${parent}.${property}` : property;
    return [
      ...(constraints ? [{ field, reason: 'invalid_value' }] : []),
      ...fieldErrors(children ?? [], field),
    ];
  });
}

export function configureApi(app: INestApplication, config: ConfigService<ApiConfig, true>): void {
  app.useLogger(app.get(Logger));
  app.getHttpAdapter().getInstance().set('trust proxy', config.getOrThrow('trustProxy'));
  app.use(helmet({ strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true } }));
  const webOrigin = config.getOrThrow('webOrigin');
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (error: Error | null, origin?: boolean | string) => void,
    ) => callback(null, requestOrigin === webOrigin ? webOrigin : false),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: { fieldErrors: fieldErrors(errors) },
    }),
  }));

  if (config.getOrThrow('environment') === 'Production') return;

  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('CreditWithFriends API')
    .setDescription('Versioned API for CreditWithFriends.')
    .setVersion('1.0.0')
    .addCookieAuth('cwf_session', { type: 'apiKey' }, 'cwf_session')
    .addServer(config.getOrThrow('apiOrigin'))
    .build());
  SwaggerModule.setup('api/docs', app, document);
}
