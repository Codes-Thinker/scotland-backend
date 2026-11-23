import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Configuration } from '@/config/configuration';
import { User } from '@/database/entities/account.entity';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) => ({
        secret: config.get('jwt.accessSecret', { infer: true }),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
    TypeOrmModule.forFeature([User]),
  ],
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
