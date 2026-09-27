import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ApiConfig } from './common/config/config.module';
import { AppModule } from './app.module';
import { configureApi } from './common/api/api.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<ApiConfig, true>);
  configureApi(app, config);
  await app.listen(config.getOrThrow('port'));
}

void bootstrap();
