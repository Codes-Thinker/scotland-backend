import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Configuration } from '@/config/configuration';
import { User } from '@/database/entities/account.entity';
import { AccountStatus } from '@/database/enums';
import { RealtimeService } from './realtime.service';

interface AccessTokenPayload {
  sub: string;
}

// Decorator options load once, so the allowed origins are read from the environment here.
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Authenticates each connection with the same access token as the REST API, then
 * places it in its own user room. Suspended or unknown accounts are disconnected.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: allowedOrigins, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Configuration, true>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    this.logger.log('Realtime gateway ready at /realtime');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = (client.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || token.length === 0) throw new Error('no token');

      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('jwt.accessSecret', { infer: true }),
        algorithms: ['HS256'],
      });
      const user = await this.users.findOne({
        where: { id: payload.sub },
        select: { id: true, status: true },
      });
      if (!user || user.status === AccountStatus.Suspended) throw new Error('inactive account');

      await client.join(`user:${user.id}`);
      client.emit('ready', { userId: user.id });
    } catch {
      client.disconnect(true);
    }
  }
}
