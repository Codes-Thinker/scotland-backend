import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Pushes events to connected clients. Every event goes to a user room, so a client
 * receives ride and chat updates without joining anything else.
 * Calls are silent no-ops until the gateway attaches, so services run fine without sockets.
 */
@Injectable()
export class RealtimeService {
  private server?: Server;

  attach(server: Server): void {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
