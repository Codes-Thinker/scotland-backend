import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import type { Configuration } from '@/config/configuration';
import { User } from '@/database/entities/account.entity';
import { AccountStatus } from '@/database/enums';
import type { AuthUser } from '../auth.types';

interface AccessTokenPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Configuration, true>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  /**
   * Reloads the user on every request so suspended accounts and role changes
   * take effect immediately, not when the access token expires.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: { id: true, roles: true, status: true },
    });
    if (!user || user.status === AccountStatus.Suspended) {
      throw new UnauthorizedException('Account is not available.');
    }
    return { id: user.id, roles: user.roles, status: user.status };
  }
}
