import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiExceptionFilter } from './common/api/api-exception.filter';
import { ApiResponseInterceptor } from './common/api/api-response.interceptor';
import { ApiConfig, ApiConfigModule } from './common/config/config.module';
import { PrismaService } from './common/database/prisma.service';
import { apiPinoOptions } from './common/logging/logging.config';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { RequestForgeryGuard } from './common/security/request-forgery.guard';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ApiConfigModule,
    LoggerModule.forRootAsync({
      imports: [ApiConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiConfig, true>) => ({
        pinoHttp: {
          autoLogging: false,
          ...apiPinoOptions(config.getOrThrow('environment')),
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    HealthModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: RequestForgeryGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
