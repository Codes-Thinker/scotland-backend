import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '@/audit/audit.service';
import { OBJECT_STORAGE, type ObjectStorage } from '@/storage/object-storage';
import { Inject } from '@nestjs/common';
import { paginate, Paged } from '@/common/pagination';
import { DriversService } from '@/drivers/drivers.service';
import {
  DocumentView,
  REQUIRED_DOCUMENTS,
  toDocumentView,
  toDriverSummary,
  DriverSummary,
} from '@/drivers/driver-views';
import { DriverDocument, DriverProfile, User } from '@/database/entities/account.entity';
import {
  AccountStatus,
  DriverDocumentStatus,
  DriverDocumentType,
  UserRole,
} from '@/database/enums';
import type { AuthUser } from '@/auth/auth.types';
import type { AdminDriversQueryDto, AdminUsersQueryDto, ReviewDocumentDto } from './dto/admin.dto';

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: UserRole[];
  status: AccountStatus;
  createdAt: Date;
}

export interface DriverDetail extends DriverSummary {
  documents: DocumentView[];
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DriverProfile) private readonly profiles: Repository<DriverProfile>,
    @InjectRepository(DriverDocument) private readonly documents: Repository<DriverDocument>,
    private readonly drivers: DriversService,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Returns a driver document for review. Every view is audited. */
  async documentFile(
    actor: AuthUser,
    driverId: string,
    type: DriverDocumentType,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const row = await this.documents.findOne({ where: { driverId, type } });
    if (!row?.fileKey) throw new NotFoundException('No file has been uploaded for that document.');

    const body = await this.storage.get(row.fileKey);
    await this.audit.record({
      actorId: actor.id,
      action: 'driver_document.viewed',
      entity: 'driver_document',
      entityId: row.id,
      payload: { driverId, type },
    });
    const ext = row.fileKey.slice(row.fileKey.lastIndexOf('.') + 1);
    return {
      body,
      contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
      filename: `${type}-${driverId.slice(0, 8)}.${ext}`,
    };
  }

  // ---- users ----

  async listUsers(q: AdminUsersQueryDto): Promise<Paged<UserSummary>> {
    const qb = this.users
      .createQueryBuilder('u')
      .select(['u.id', 'u.name', 'u.email', 'u.phone', 'u.roles', 'u.status', 'u.createdAt'])
      .orderBy('u.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);

    if (q.role) qb.andWhere(':role = ANY(u.roles)', { role: q.role });
    if (q.status) qb.andWhere('u.status = :status', { status: q.status });
    if (q.q) {
      qb.andWhere('(u.name ILIKE :term OR u.email ILIKE :term OR u.phone ILIKE :term)', {
        term: `%${q.q}%`,
      });
    }

    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows.map(toUserSummary), total, q);
  }

  async setUserStatus(
    actor: AuthUser,
    userId: string,
    status: AccountStatus,
  ): Promise<UserSummary> {
    if (actor.id === userId) {
      throw new ConflictException('You cannot change your own account status.');
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    const from = user.status;
    if (from === status) return toUserSummary(user);

    user.status = status;
    await this.users.save(user);

    // A suspended or unapproved driver must not stay online.
    if (status !== AccountStatus.Active && user.roles.includes(UserRole.Driver)) {
      await this.drivers.forceOffline(userId);
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'user.status_changed',
      entity: 'user',
      entityId: userId,
      payload: { from, to: status },
    });
    return toUserSummary(user);
  }

  // ---- drivers ----

  async listDrivers(q: AdminDriversQueryDto): Promise<Paged<DriverSummary>> {
    const qb = this.profiles
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.user', 'u')
      .leftJoinAndSelect('p.vehicles', 'v')
      .orderBy('u.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);

    if (q.onlineStatus) qb.andWhere('p.onlineStatus = :online', { online: q.onlineStatus });
    if (q.status) qb.andWhere('u.status = :status', { status: q.status });
    if (q.zone) qb.andWhere('p.operatingZone = :zone', { zone: q.zone });
    if (q.q) {
      qb.andWhere(
        '(u.name ILIKE :term OR u.email ILIKE :term OR u.phone ILIKE :term OR v.plate ILIKE :term)',
        { term: `%${q.q}%` },
      );
    }

    const [profiles, total] = await qb.getManyAndCount();
    const docs = await this.documentsFor(profiles.map((p) => p.userId));
    const data = profiles.map((p) =>
      toDriverSummary(p.user, p, p.vehicles?.[0], docs.get(p.userId) ?? []),
    );
    return paginate(data, total, q);
  }

  async getDriver(driverId: string): Promise<DriverDetail> {
    const profile = await this.profiles.findOne({
      where: { userId: driverId },
      relations: { user: true, vehicles: true },
    });
    if (!profile) throw new NotFoundException('Driver not found.');
    const rows = await this.documents.find({ where: { driverId } });
    return {
      ...toDriverSummary(profile.user, profile, profile.vehicles?.[0], rows),
      documents: REQUIRED_DOCUMENTS.map((type) =>
        toDocumentView(
          type,
          rows.find((r) => r.type === type),
        ),
      ),
    };
  }

  /**
   * Approves, expires or rejects one document. Rejecting or expiring a document
   * takes the driver offline immediately, and the action is audited.
   */
  async reviewDocument(
    actor: AuthUser,
    driverId: string,
    type: DriverDocumentType,
    dto: ReviewDocumentDto,
  ): Promise<DocumentView> {
    const row = await this.documents.findOne({ where: { driverId, type } });
    if (!row) throw new NotFoundException('That driver has not uploaded this document.');
    if (dto.status === 'verified' && !row.fileKey) {
      throw new BadRequestException('Cannot verify a document with no file.');
    }

    const from = row.status;
    row.status = dto.status as DriverDocumentStatus;
    row.reviewedBy = actor.id;
    row.reviewedAt = new Date();
    await this.documents.save(row);

    if (dto.status !== 'verified') await this.drivers.forceOffline(driverId);

    await this.audit.record({
      actorId: actor.id,
      action: 'driver_document.reviewed',
      entity: 'driver_document',
      entityId: row.id,
      payload: { driverId, type, from, to: dto.status, note: dto.note ?? null },
    });
    return toDocumentView(type, row);
  }

  private async documentsFor(driverIds: string[]): Promise<Map<string, DriverDocument[]>> {
    const map = new Map<string, DriverDocument[]>();
    if (driverIds.length === 0) return map;
    const rows = await this.documents
      .createQueryBuilder('d')
      .where('d.driverId IN (:...ids)', { ids: driverIds })
      .getMany();
    for (const row of rows) {
      const list = map.get(row.driverId) ?? [];
      list.push(row);
      map.set(row.driverId, list);
    }
    return map;
  }
}

function toUserSummary(
  u: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'roles' | 'status' | 'createdAt'>,
): UserSummary {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    roles: u.roles,
    status: u.status,
    createdAt: u.createdAt,
  };
}
