import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { AuthUser } from '@/auth/auth.types';
import { ChatMessage, ChatThread } from '@/database/entities/chat.entity';
import { Ride } from '@/database/entities/ride.entity';
import { ChatSenderType, RideStatus, UserRole } from '@/database/enums';
import { RealtimeService } from '@/realtime/realtime.service';

/** Chat opens once a driver is assigned and closes when the ride completes or is cancelled. */
const OPEN_STATUSES = [RideStatus.Assigned, RideStatus.Arrived, RideStatus.InProgress];

export interface MessageView {
  id: string;
  rideId: string;
  senderType: ChatSenderType;
  senderId: string | null;
  body: string;
  createdAt: Date;
}

export interface MessagePage {
  data: MessageView[];
  nextCursor: string | null;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(ChatThread) private readonly threads: Repository<ChatThread>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    user: AuthUser,
    rideId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<MessagePage> {
    const ride = await this.participantRide(user, rideId);
    const thread = await this.threads.findOne({ where: { rideId: ride.id } });
    if (!thread) return { data: [], nextCursor: null };

    const rows = await this.messages.find({
      where: {
        threadId: thread.id,
        ...(cursor ? { createdAt: LessThan(new Date(cursor)) } : {}),
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const last = rows[rows.length - 1];
    return {
      data: rows.map((m) => toView(m, ride.id)),
      nextCursor: rows.length === limit && last ? last.createdAt.toISOString() : null,
    };
  }

  async send(user: AuthUser, rideId: string, body: string): Promise<MessageView> {
    const ride = await this.participantRide(user, rideId);
    if (
      user.roles.includes(UserRole.Admin) &&
      ride.passengerId !== user.id &&
      ride.driverId !== user.id
    ) {
      throw new ForbiddenException('Operations cannot post in ride chat.');
    }
    if (!ride.driverId) {
      throw new ConflictException('Chat opens once a driver is assigned.');
    }
    if (!OPEN_STATUSES.includes(ride.status)) {
      throw new ConflictException('Chat is closed for this ride.');
    }

    const thread = await this.threadFor(ride.id);
    const isDriver = ride.driverId === user.id;
    const saved = await this.messages.save(
      this.messages.create({
        threadId: thread.id,
        senderType: isDriver ? ChatSenderType.Driver : ChatSenderType.Passenger,
        senderId: user.id,
        body,
      }),
    );

    const view = toView(saved, ride.id);
    this.realtime.toUser(ride.passengerId, 'chat.message', view);
    this.realtime.toUser(ride.driverId, 'chat.message', view);
    return view;
  }

  /** The ride must exist and the user must be its passenger, its assigned driver, or an admin. */
  private async participantRide(user: AuthUser, rideId: string): Promise<Ride> {
    const ride = await this.rides.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found.');
    const allowed =
      ride.passengerId === user.id ||
      ride.driverId === user.id ||
      user.roles.includes(UserRole.Admin);
    if (!allowed) throw new NotFoundException('Ride not found.');
    return ride;
  }

  /** Creates the thread on first use. A concurrent create is resolved by re-reading. */
  private async threadFor(rideId: string): Promise<ChatThread> {
    const existing = await this.threads.findOne({ where: { rideId } });
    if (existing) return existing;
    try {
      return await this.threads.save(this.threads.create({ rideId }));
    } catch {
      const again = await this.threads.findOne({ where: { rideId } });
      if (!again) throw new ConflictException('Could not open the chat, please retry.');
      return again;
    }
  }
}

function toView(m: ChatMessage, rideId?: string): MessageView {
  return {
    id: m.id,
    rideId: rideId ?? '',
    senderType: m.senderType,
    senderId: m.senderId,
    body: m.body,
    createdAt: m.createdAt,
  };
}
