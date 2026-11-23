import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import type { Configuration } from '@/config/configuration';
import { hashPassword, verifyPassword } from '@/common/password';
import { DriverProfile, User, Vehicle } from '@/database/entities/account.entity';
import { RefreshToken } from '@/database/entities/auth.entity';
import { AccountStatus, DriverOnlineStatus, UserRole, VehicleCategory } from '@/database/enums';
import type {
  LoginDto,
  RegisterDriverDto,
  RegisterPassengerDto,
  TokensResponse,
  UserResponse,
} from './dto/auth.dto';

const PG_UNIQUE_VIOLATION = '23505';

type UserWithDriver = User & { driverProfile?: (DriverProfile & { vehicles?: Vehicle[] }) | null };

export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  // Computed once. Used to keep login timing similar when the email is unknown.
  private readonly dummyHash = hashPassword(randomBytes(24).toString('hex'));

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  async registerPassenger(dto: RegisterPassengerDto): Promise<TokensResponse> {
    const user = await this.dataSource.transaction((m) =>
      this.insertUser(m, dto, [UserRole.Passenger], AccountStatus.Active),
    );
    return this.issueTokens(await this.loadUser(user.id));
  }

  /** Driver accounts start as `pending` until an admin approves them (see contract §5.5). */
  async registerDriver(dto: RegisterDriverDto): Promise<TokensResponse> {
    const userId = await this.dataSource.transaction(async (m) => {
      const user = await this.insertUser(m, dto, [UserRole.Driver], AccountStatus.Pending);
      await m.save(DriverProfile, {
        userId: user.id,
        licenceNumber: dto.licenceNumber ?? null,
        operatingZone: dto.operatingZone,
      });
      try {
        await m.save(Vehicle, {
          driverId: user.id,
          makeModel: dto.vehicleMakeModel,
          plate: dto.vehiclePlate,
          category: VehicleCategory.FourSeater,
        });
      } catch (err) {
        if (isUniqueViolation(err))
          throw new ConflictException('That number plate is already registered.');
        throw err;
      }
      return user.id;
    });
    return this.issueTokens(await this.loadUser(userId));
  }

  async login(dto: LoginDto): Promise<TokensResponse> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordOk = await verifyPassword(dto.password, hash);
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    this.assertNotSuspended(user);
    return this.issueTokens(await this.loadUser(user.id));
  }

  /** Rotates the refresh token. Reusing a revoked token signals theft: all sessions end. */
  async refresh(rawToken: string): Promise<TokensResponse> {
    const hash = this.hashToken(rawToken);
    const now = new Date();

    // Claim the token atomically: only one concurrent request can flip revoked_at from NULL.
    const claimed = await this.refreshTokens.update(
      { tokenHash: hash, revokedAt: IsNull(), expiresAt: MoreThan(now) },
      { revokedAt: now },
    );
    if (claimed.affected !== 1) {
      const row = await this.refreshTokens.findOne({ where: { tokenHash: hash } });
      // A token that exists but is already revoked was used twice: end every session for that user.
      if (row?.revokedAt) {
        await this.refreshTokens.update(
          { userId: row.userId, revokedAt: IsNull() },
          { revokedAt: now },
        );
      }
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const row = await this.refreshTokens.findOneOrFail({ where: { tokenHash: hash } });
    const user = await this.loadUser(row.userId);
    this.assertNotSuspended(user);
    return this.issueTokens(user);
  }

  /** Always succeeds, so callers cannot probe which tokens exist. */
  async logout(rawToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: this.hashToken(rawToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async me(userId: string): Promise<UserResponse> {
    return this.toUserResponse(await this.loadUser(userId));
  }

  // ---- helpers ----

  private async insertUser(
    m: EntityManager,
    input: RegisterPassengerDto,
    roles: UserRole[],
    status: AccountStatus,
  ): Promise<User> {
    const existing = await m.findOne(User, { where: { email: input.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists. Sign in instead.');
    }
    try {
      return await m.save(User, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
        roles,
        status,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('An account with this email already exists. Sign in instead.');
      }
      throw err;
    }
  }

  private assertNotSuspended(user: Pick<User, 'status'>): void {
    if (user.status === AccountStatus.Suspended) {
      throw new ForbiddenException('This account is suspended. Please contact support.');
    }
  }

  private async issueTokens(user: UserWithDriver): Promise<TokensResponse> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, roles: user.roles },
      { expiresIn: this.config.get('jwt.accessTtl', { infer: true }) },
    );
    const { exp, iat } = this.jwt.decode<{ exp: number; iat: number }>(accessToken);

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshDays = this.config.get('jwt.refreshTtlDays', { infer: true });
    await this.refreshTokens.save({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshDays * 86400e3),
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: exp - iat,
      user: this.toUserResponse(user),
    };
  }

  private async loadUser(id: string): Promise<UserWithDriver> {
    const user = await this.users.findOne({
      where: { id },
      relations: { driverProfile: { vehicles: true } },
    });
    if (!user) throw new UnauthorizedException('Account not found.');
    return user;
  }

  private toUserResponse(user: UserWithDriver): UserResponse {
    const profile = user.driverProfile;
    const vehicle = profile?.vehicles?.[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      status: user.status,
      ...(profile && {
        driver: {
          operatingZone: profile.operatingZone,
          onlineStatus: profile.onlineStatus ?? DriverOnlineStatus.Offline,
          ratingAvg: profile.ratingAvg,
          ridesCount: profile.ridesCount,
          vehicle: vehicle
            ? { makeModel: vehicle.makeModel, plate: vehicle.plate, category: vehicle.category }
            : null,
        },
      }),
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { driverError?: { code?: string } })?.driverError?.code === PG_UNIQUE_VIOLATION;
}
