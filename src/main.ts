import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApp } from '@/bootstrap';
import type { Configuration } from '@/config/configuration';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService<Configuration, true>);
  const { env, port, apiPrefix } = config.get('app', { infer: true });

  await app.listen(port);
  Logger.log(`API running on http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
  if (env !== 'production') {
    Logger.log(`Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
  }
}

void bootstrap();
