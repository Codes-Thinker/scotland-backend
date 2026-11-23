import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { Configuration, validationSchema } from '@/config/configuration';
import { buildDataSourceOptions } from '@/database/database-options';
import { HealthModule } from '@/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) =>
        buildDataSourceOptions(config.get('database', { infer: true })),
    }),
    HealthModule,
  ],
})
export class AppModule {}
