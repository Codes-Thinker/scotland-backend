import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { Configuration, validationSchema } from '@/config/configuration';
import { buildDataSourceOptions } from '@/database/database-options';
import { AuthModule } from '@/auth/auth.module';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { HealthModule } from '@/health/health.module';
import { AuditModule } from '@/audit/audit.module';
import { StorageModule } from '@/storage/storage.module';
import { DriversModule } from '@/drivers/drivers.module';
import { AdminModule } from '@/admin/admin.module';
import { RidesModule } from '@/rides/rides.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    // Global default: 100 requests per minute per IP. Auth routes are stricter.
    // Read from env at load time; the e2e run raises it so one test process is not throttled.
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: Number(process.env.GLOBAL_RATE_LIMIT_PER_MIN ?? 100) },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) =>
        buildDataSourceOptions(config.get('database', { infer: true })),
    }),
    AuditModule,
    StorageModule,
    AuthModule,
    DriversModule,
    RidesModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limit, then authenticate (unless @Public), then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
