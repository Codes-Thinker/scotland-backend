import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import type { Configuration } from '@/config/configuration';
import {
  Block,
  DriverDocument,
  DriverLocation,
  DriverProfile,
  User,
  Vehicle,
} from '@/database/entities/account.entity';
import {
  AccountStatus,
  DriverDocumentStatus,
  DriverDocumentType,
  DriverOnlineStatus,
  UserRole,
  VehicleCategory,
} from '@/database/enums';
import { OBJECT_STORAGE, type ObjectStorage } from '@/storage/object-storage';
import { detectDocumentMime, DOCUMENT_EXTENSIONS } from './document-file';
import {
  allDocumentsValid,
  DocumentView,
  REQUIRED_DOCUMENTS,
  toDocumentView,
} from './driver-views';
import type {
  CreateBlockDto,
  SetOnlineStatusDto,
  UpdateDriverProfileDto,
  UpdateLocationDto,
} from './dto/driver.dto';

const PG_UNIQUE_VIOLATION = '23505';

export interface DriverProfileView {
  id: string;
  name: string;
  email: string;
  phone: string;
  accountStatus: AccountStatus;
  onlineStatus: DriverOnlineStatus;
  operatingZone: string | null;
  licenceNumber: string | null;
  ratingAvg: number;
  ridesCount: number;
  vehicle: { makeModel: string; plate: string; category: VehicleCategory } | null;
  documentsValid: boolean;
}

export interface BlockView {
  passengerId: string;
  name: string;
  createdAt: Date;
}

type DriverWithProfile = User & { driverProfile: DriverProfile & { vehicles?: Vehicle[] } };

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DriverProfile) private readonly profiles: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(DriverDocument) private readonly documents: Repository<DriverDocument>,
    @InjectRepository(DriverLocation) private readonly locations: Repository<DriverLocation>,
    @InjectRepository(Block) private readonly blocks: Repository<Block>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  // ---- profile ----

  async getProfile(driverId: string): Promise<DriverProfileView> {
    const user = await this.loadDriver(driverId);
    const docs = await this.documents.find({ where: { driverId } });
    return this.toProfileView(user, docs);
  }

  async updateProfile(driverId: string, dto: UpdateDriverProfileDto): Promise<DriverProfileView> {
    const user = await this.loadDriver(driverId);
    const profile = user.driverProfile;

    if (dto.operatingZone !== undefined) profile.operatingZone = dto.operatingZone;
    if (dto.licenceNumber !== undefined) profile.licenceNumber = dto.licenceNumber;
    await this.profiles.save(profile);

    if (dto.vehicleMakeModel !== undefined || dto.vehiclePlate !== undefined) {
      const current = profile.vehicles?.[0];
      const vehicle =
        current ??
        this.vehicles.create({
          driverId,
          category: VehicleCategory.FourSeater,
          makeModel: '',
          plate: '',
        });
      if (dto.vehicleMakeModel !== undefined) vehicle.makeModel = dto.vehicleMakeModel;
      if (dto.vehiclePlate !== undefined) vehicle.plate = dto.vehiclePlate;
      if (!vehicle.makeModel || !vehicle.plate) {
        throw new BadRequestException('Provide both vehicleMakeModel and vehiclePlate.');
      }
      try {
        await this.vehicles.save(vehicle);
      } catch (err) {
        if (isUniqueViolation(err))
          throw new ConflictException('That number plate is already registered.');
        throw err;
      }
    }
    return this.getProfile(driverId);
  }

  /** Going online needs an approved account and all five documents valid. Offline is always allowed when not on a trip. */
  async setOnlineStatus(driverId: string, dto: SetOnlineStatusDto): Promise<DriverProfileView> {
    const user = await this.loadDriver(driverId);
    const profile = user.driverProfile;

    if (profile.onlineStatus === DriverOnlineStatus.OnTrip) {
      // A trip in progress keeps its status until it completes (rides module, step 6).
      if (dto.status === 'offline') {
        throw new ConflictException('Finish your active ride before going offline.');
      }
      return this.toProfileView(user, await this.documents.find({ where: { driverId } }));
    }

    if (dto.status === 'online') {
      if (user.status !== AccountStatus.Active) {
        throw new ForbiddenException('Your account is awaiting approval.');
      }
      const docs = await this.documents.find({ where: { driverId } });
      if (!allDocumentsValid(docs)) {
        throw new ConflictException(
          'All five documents must be verified before you can go online.',
        );
      }
      profile.onlineStatus = DriverOnlineStatus.Online;
    } else {
      profile.onlineStatus = DriverOnlineStatus.Offline;
    }
    await this.profiles.save(profile);
    return this.getProfile(driverId);
  }

  async updateLocation(driverId: string, dto: UpdateLocationDto): Promise<void> {
    await this.locations.upsert(
      {
        driverId,
        lat: dto.lat,
        lng: dto.lng,
        heading: dto.heading ?? null,
        updatedAt: new Date(),
      },
      ['driverId'],
    );
  }

  // ---- documents ----

  async listDocuments(driverId: string): Promise<DocumentView[]> {
    await this.loadDriver(driverId);
    const rows = await this.documents.find({ where: { driverId } });
    return REQUIRED_DOCUMENTS.map((type) =>
      toDocumentView(
        type,
        rows.find((r) => r.type === type),
      ),
    );
  }

  /**
   * Stores a new document and sets it to pending. The file type is decided from its bytes.
   * Replacing a verified document drops the driver offline until it is re-verified.
   */
  async uploadDocument(
    driverId: string,
    type: DriverDocumentType,
    file: Express.Multer.File | undefined,
    expiresAt?: string,
  ): Promise<DocumentView> {
    await this.loadDriver(driverId);

    if (!file?.buffer?.length) {
      throw new BadRequestException('Attach the document as a file in the "file" field.');
    }
    const maxBytes = this.config.get('storage.maxUploadBytes', { infer: true });
    if (file.buffer.length > maxBytes) {
      throw new PayloadTooLargeException(
        `Files must be ${Math.round(maxBytes / 1048576)} MB or smaller.`,
      );
    }
    const mime = detectDocumentMime(file.buffer);
    if (!mime) {
      throw new UnsupportedMediaTypeException('Upload a PDF, JPEG or PNG file.');
    }
    const expires = expiresAt ? new Date(expiresAt) : null;
    if (expires && expires.getTime() <= Date.now()) {
      throw new BadRequestException('The expiry date must be in the future.');
    }

    const key = `drivers/${driverId}/${type}/${randomUUID()}.${DOCUMENT_EXTENSIONS[mime]}`;
    await this.storage.put(key, file.buffer, mime);

    const row =
      (await this.documents.findOne({ where: { driverId, type } })) ??
      this.documents.create({ driverId, type });
    const previousKey = row.fileKey;
    const wasVerified = row.status === DriverDocumentStatus.Verified;

    row.status = DriverDocumentStatus.Pending;
    row.fileKey = key;
    row.expiresAt = expires;
    row.reviewedBy = null;
    row.reviewedAt = null;
    await this.documents.save(row);

    if (wasVerified) await this.forceOffline(driverId);
    if (previousKey) await this.safeDelete(previousKey);

    return toDocumentView(type, row);
  }

  // ---- blocks ----

  async listBlocks(driverId: string): Promise<BlockView[]> {
    const rows = await this.blocks.find({
      where: { driverId },
      relations: { passenger: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((b) => ({
      passengerId: b.passengerId,
      name: b.passenger.name,
      createdAt: b.createdAt,
    }));
  }

  async block(driverId: string, dto: CreateBlockDto): Promise<BlockView> {
    if (dto.passengerId === driverId) {
      throw new BadRequestException('You cannot block yourself.');
    }
    const passenger = await this.users.findOne({ where: { id: dto.passengerId } });
    if (!passenger || !passenger.roles.includes(UserRole.Passenger)) {
      throw new NotFoundException('Passenger not found.');
    }
    const existing = await this.blocks.findOne({
      where: { driverId, passengerId: dto.passengerId },
    });
    const row =
      existing ??
      (await this.blocks.save(this.blocks.create({ driverId, passengerId: dto.passengerId })));
    return { passengerId: row.passengerId, name: passenger.name, createdAt: row.createdAt };
  }

  async unblock(driverId: string, passengerId: string): Promise<void> {
    await this.blocks.delete({ driverId, passengerId });
  }

  // ---- helpers ----

  /** Used by admin actions too: a driver who loses valid documents or is suspended goes offline. */
  async forceOffline(driverId: string): Promise<void> {
    await this.profiles.update(
      { userId: driverId, onlineStatus: DriverOnlineStatus.Online },
      { onlineStatus: DriverOnlineStatus.Offline },
    );
  }

  private async loadDriver(driverId: string): Promise<DriverWithProfile> {
    const user = await this.users.findOne({
      where: { id: driverId },
      relations: { driverProfile: { vehicles: true } },
    });
    if (!user?.driverProfile) throw new NotFoundException('Driver profile not found.');
    return user as DriverWithProfile;
  }

  private toProfileView(user: DriverWithProfile, docs: DriverDocument[]): DriverProfileView {
    const vehicle = user.driverProfile.vehicles?.[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      accountStatus: user.status,
      onlineStatus: user.driverProfile.onlineStatus,
      operatingZone: user.driverProfile.operatingZone,
      licenceNumber: user.driverProfile.licenceNumber,
      ratingAvg: user.driverProfile.ratingAvg,
      ridesCount: user.driverProfile.ridesCount,
      vehicle: vehicle
        ? { makeModel: vehicle.makeModel, plate: vehicle.plate, category: vehicle.category }
        : null,
      documentsValid: allDocumentsValid(docs),
    };
  }

  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Orphaned file is harmless; log-and-continue keeps the upload successful.
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { driverError?: { code?: string } })?.driverError?.code === PG_UNIQUE_VIOLATION;
}
