import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiExceptionFilter } from './common/api/api-exception.filter';
import { ApiResponseInterceptor } from './common/api/api-response.interceptor';
import { ApiConfig, ApiConfigModule, TEST_AUTH_ROUTES_ENABLED } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { apiPinoOptions } from './common/logging/logging.config';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { RequestForgeryGuard } from './common/security/request-forgery.guard';
import { HealthModule } from './modules/health/health.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './modules/accounts/accounts.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SessionGuard } from './modules/sessions/session.guard';
import { TestAuthModule } from './modules/accounts/test-auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { PrivacyNoticeModule } from './modules/privacy-notice/privacy-notice.module';
import { PrivacyNoticeGuard } from './modules/privacy-notice/privacy-notice.guard';
import { CirclesModule } from './modules/circles/circles.module';
import { UsageModule } from './modules/usage/usage.module';

@Module({
  imports: [
    ApiConfigModule,
    DatabaseModule,
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
    ScheduleModule.forRoot(),
    SessionsModule,
    AccountsModule,
    ProfileModule,
    PrivacyNoticeModule,
    CirclesModule,
    UsageModule,
    ...(TEST_AUTH_ROUTES_ENABLED ? [TestAuthModule] : []),
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RequestForgeryGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useExisting: PrivacyNoticeGuard },
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
