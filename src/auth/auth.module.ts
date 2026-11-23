import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Configuration } from '@/config/configuration';
import { DriverProfile, User, Vehicle } from '@/database/entities/account.entity';
import { RefreshToken } from '@/database/entities/auth.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) => ({
        secret: config.get('jwt.accessSecret', { infer: true }),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
    TypeOrmModule.forFeature([User, DriverProfile, Vehicle, RefreshToken]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
