import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from '@/app.module';
import type { Configuration } from '@/config/configuration';

/** Builds the Nest app with the same middleware, pipes and docs in prod and tests. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Configuration, true>);
  const { env, apiPrefix, corsOrigins } = config.get('app', { infer: true });

  app.useWebSocketAdapter(new IoAdapter(app));
  const http = app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void };
  http.set('trust proxy', config.get('app.trustProxy', { infer: true }));
  app.setGlobalPrefix(apiPrefix, { exclude: ['health'] });
  app.use(helmet());
  app.use(compression());
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (env !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('Fife Nearby Taxis API')
      .setDescription('Passenger, driver and admin API. Contract: docs/API_CONTRACT.md')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  return app;
}
