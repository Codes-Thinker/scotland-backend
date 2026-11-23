import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { paginate, Paged, PageQueryDto } from '@/common/pagination';
import { Alert } from '@/database/entities/alert.entity';
import { AlertType } from '@/database/enums';
import { RealtimeService } from '@/realtime/realtime.service';

export interface AlertView {
  id: string;
  type: AlertType;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    private readonly realtime: RealtimeService,
  ) {}

  /** Stores an alert and pushes it to the user if they are connected. */
  async notify(userId: string, type: AlertType, title: string, body: string): Promise<void> {
    const row = await this.alerts.save(this.alerts.create({ userId, type, title, body }));
    this.realtime.toUser(userId, 'alert.new', toView(row));
  }

  async list(userId: string, q: PageQueryDto): Promise<Paged<AlertView>> {
    const [rows, total] = await this.alerts.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    return paginate(rows.map(toView), total, q);
  }

  /** Marks the given alerts read, or every unread alert when no ids are given. */
  async markRead(userId: string, ids?: string[]): Promise<number> {
    const result = await this.alerts.update(
      { userId, readAt: IsNull(), ...(ids?.length ? { id: In(ids) } : {}) },
      { readAt: new Date() },
    );
    return result.affected ?? 0;
  }
}

function toView(
  a: Pick<Alert, 'id' | 'type' | 'title' | 'body' | 'createdAt' | 'readAt'>,
): AlertView {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    body: a.body,
    createdAt: a.createdAt,
    readAt: a.readAt,
  };
}
