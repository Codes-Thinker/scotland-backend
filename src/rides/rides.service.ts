import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '@/audit/audit.service';
import type { AuthUser } from '@/auth/auth.types';
import { paginate, Paged } from '@/common/pagination';
import { DriverLocation, DriverProfile, User } from '@/database/entities/account.entity';
import { Payment } from '@/database/entities/payment.entity';
import { PricingRule } from '@/database/entities/ops.entity';
import { RideOffer, Ride, RideRating } from '@/database/entities/ride.entity';
import {
  AccountStatus,
  BookingMode,
  DispatchPriority,
  DriverOnlineStatus,
  OfferResponse,
  PaymentStatus,
  RatedByRole,
  RideStatus,
  RideType,
  UserRole,
  VehicleCategory,
} from '@/database/enums';
import { DispatchService } from './dispatch.service';
import { estimateRoadMeters, haversineMeters, priceFare } from './geo-pricing';
import type {
  AdminRidesQueryDto,
  CancelRideDto,
  CompleteRideDto,
  CreateRideDto,
  EstimateRideDto,
  ListRidesQueryDto,
  RateRideDto,
} from './dto/ride.dto';

const ACTIVE_STATUSES = [
  RideStatus.Requested,
  RideStatus.Assigned,
  RideStatus.Arrived,
  RideStatus.InProgress,
];
const SCHEDULE_MIN_LEAD_MS = 15 * 60_000;

export interface RideView {
  id: string;
  status: RideStatus;
  rideType: RideType;
  bookingMode: BookingMode;
  vehicleCategory: VehicleCategory;
  priority: DispatchPriority;
  pickup: { address: string; lat: number | null; lng: number | null };
  drop: { address: string; lat: number | null; lng: number | null };
  scheduledAt: Date | null;
  distanceM: number | null;
  fareEstimatePence: number;
  fareFinalPence: number | null;
  requestedAt: Date;
  assignedAt: Date | null;
  arrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  passenger: { id: string; name: string; phone?: string };
  driver: { id: string; name: string; phone?: string } | null;
}

export interface EstimateView {
  rideType: RideType;
  bookingMode: BookingMode;
  distanceM: number;
  fareEstimatePence: number;
  currency: 'GBP';
}

export interface OfferView {
  offerId: string;
  rideId: string;
  rideType: RideType;
  pickup: { address: string; lat: number | null; lng: number | null };
  drop: { address: string; lat: number | null; lng: number | null };
  fareEstimatePence: number;
  distanceToPickupM: number | null;
  expiresAt: Date;
}

type RideWithParties = Ride & { passenger: User; driver?: User | null };

@Injectable()
export class RidesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dispatch: DispatchService,
    private readonly audit: AuditService,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(RideOffer) private readonly offers: Repository<RideOffer>,
    @InjectRepository(RideRating) private readonly ratings: Repository<RideRating>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(PricingRule) private readonly pricing: Repository<PricingRule>,
    @InjectRepository(DriverLocation) private readonly locations: Repository<DriverLocation>,
    @InjectRepository(DriverProfile) private readonly profiles: Repository<DriverProfile>,
  ) {}

  // ---- passenger ----

  async estimate(dto: EstimateRideDto): Promise<EstimateView> {
    const bookingMode = dto.bookingMode ?? BookingMode.Now;
    this.validateSchedule(bookingMode, dto.scheduledAt);
    const distanceM = estimateRoadMeters(dto.pickup, dto.drop);
    const rule = await this.activeRule(dto.rideType);
    return {
      rideType: dto.rideType,
      bookingMode,
      distanceM,
      fareEstimatePence: priceFare(rule, distanceM, bookingMode === BookingMode.Later),
      currency: 'GBP',
    };
  }

  async create(passenger: AuthUser, dto: CreateRideDto): Promise<RideView> {
    const bookingMode = dto.bookingMode ?? BookingMode.Now;
    this.validateSchedule(bookingMode, dto.scheduledAt);

    const active = await this.rides.exists({
      where: { passengerId: passenger.id, status: In(ACTIVE_STATUSES) },
    });
    if (active) throw new ConflictException('You already have an active ride.');

    const distanceM = estimateRoadMeters(dto.pickup, dto.drop);
    const rule = await this.activeRule(dto.rideType);
    const fare = priceFare(rule, distanceM, bookingMode === BookingMode.Later);

    const saved = await this.rides.save(
      this.rides.create({
        passengerId: passenger.id,
        status: RideStatus.Requested,
        rideType: dto.rideType,
        bookingMode,
        vehicleCategory: dto.vehicleCategory ?? VehicleCategory.FourSeater,
        priority:
          dto.rideType === RideType.Standard ? DispatchPriority.Normal : DispatchPriority.High,
        pickupAddress: dto.pickup.address,
        pickupLat: dto.pickup.lat,
        pickupLng: dto.pickup.lng,
        dropAddress: dto.drop.address,
        dropLat: dto.drop.lat,
        dropLng: dto.drop.lng,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        distanceM,
        fareEstimatePence: fare,
      }),
    );

    if (bookingMode === BookingMode.Now) await this.dispatch.dispatch(saved.id);
    return this.toView(await this.loadRide(saved.id), 'passenger');
  }

  async listForUser(user: AuthUser, q: ListRidesQueryDto): Promise<Paged<RideView>> {
    const asDriver = q.role === 'driver';
    if (asDriver && !user.roles.includes(UserRole.Driver)) {
      throw new ForbiddenException('No driver account on this user.');
    }
    const where = asDriver ? { driverId: user.id } : { passengerId: user.id };
    const [rows, total] = await this.rides.findAndCount({
      where: q.status ? { ...where, status: q.status } : where,
      relations: { passenger: true, driver: true },
      order: { requestedAt: 'DESC' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    const viewer = asDriver ? 'driver' : 'passenger';
    return paginate(
      rows.map((r) => this.toView(r, viewer)),
      total,
      q,
    );
  }

  async getForUser(user: AuthUser, id: string): Promise<RideView> {
    const ride = await this.loadRide(id);
    const viewer = this.viewerRole(user, ride);
    if (!viewer) throw new NotFoundException('Ride not found.');
    return this.toView(ride, viewer);
  }

  async cancel(user: AuthUser, id: string, dto: CancelRideDto): Promise<RideView> {
    const isAdmin = user.roles.includes(UserRole.Admin);
    const result = await this.dataSource.transaction(async (m) => {
      const ride = await this.lockRide(m, id);
      if (!ride) throw new NotFoundException('Ride not found.');
      const isOwner = ride.passengerId === user.id;
      if (!isOwner && !isAdmin) throw new NotFoundException('Ride not found.');

      const cancellable = [RideStatus.Requested, RideStatus.Assigned];
      if (isAdmin) cancellable.push(RideStatus.Arrived);
      if (!cancellable.includes(ride.status)) {
        throw new ConflictException('This ride can no longer be cancelled.');
      }

      const releasedDriverId = ride.driverId;
      ride.status = RideStatus.Cancelled;
      ride.cancelledAt = new Date();
      ride.cancelReason =
        dto.reason ?? (isAdmin && !isOwner ? 'Cancelled by operations' : 'Cancelled by passenger');
      await m.save(ride);

      await m.update(
        RideOffer,
        { rideId: ride.id, response: OfferResponse.Pending },
        {
          response: OfferResponse.Expired,
          respondedAt: new Date(),
        },
      );
      if (releasedDriverId) {
        await m.update(
          DriverProfile,
          { userId: releasedDriverId, onlineStatus: DriverOnlineStatus.OnTrip },
          { onlineStatus: DriverOnlineStatus.Online },
        );
      }
      if (isAdmin && !isOwner) {
        await this.audit.record({
          actorId: user.id,
          action: 'ride.cancelled',
          entity: 'ride',
          entityId: ride.id,
          payload: { reason: ride.cancelReason },
        });
      }
      return ride.id;
    });
    return this.toView(await this.loadRide(result), isAdmin ? 'admin' : 'passenger');
  }

  async rate(passenger: AuthUser, id: string, dto: RateRideDto): Promise<RideView> {
    const ride = await this.loadRide(id);
    if (ride.passengerId !== passenger.id) throw new NotFoundException('Ride not found.');
    if (ride.status !== RideStatus.Completed || !ride.driverId) {
      throw new ConflictException('You can rate a ride once it is completed.');
    }
    const existing = await this.ratings.exists({ where: { rideId: id } });
    if (existing) throw new ConflictException('This ride has already been rated.');

    await this.dataSource.transaction(async (m) => {
      await m.save(
        RideRating,
        m.create(RideRating, {
          rideId: id,
          ratedByUserId: passenger.id,
          ratedByRole: RatedByRole.Passenger,
          score: dto.score,
          comment: dto.comment ?? null,
        }),
      );
      const agg: { avg: number | null; n: number }[] = await m.query(
        `SELECT AVG(r.score)::float AS avg, COUNT(*)::int AS n
           FROM ride_ratings r JOIN rides ri ON ri.id = r.ride_id
          WHERE ri.driver_id = $1 AND r.rated_by_role = 'passenger'`,
        [ride.driverId],
      );
      await m.update(
        DriverProfile,
        { userId: ride.driverId as string },
        { ratingAvg: Math.round((agg[0]?.avg ?? 0) * 100) / 100 },
      );
    });
    return this.toView(await this.loadRide(id), 'passenger');
  }

  // ---- driver ----

  async offersFor(driver: AuthUser): Promise<OfferView[]> {
    const now = new Date();
    const open = await this.offers.find({
      where: { driverId: driver.id, response: OfferResponse.Pending },
      relations: { ride: true },
      order: { sentAt: 'ASC' },
    });
    const live = open.filter(
      (o) => o.expiresAt.getTime() > now.getTime() && o.ride.status === RideStatus.Requested,
    );
    const loc = await this.locations.findOne({ where: { driverId: driver.id } });
    return live.map((o) => ({
      offerId: o.id,
      rideId: o.rideId,
      rideType: o.ride.rideType,
      pickup: { address: o.ride.pickupAddress, lat: o.ride.pickupLat, lng: o.ride.pickupLng },
      drop: { address: o.ride.dropAddress, lat: o.ride.dropLat, lng: o.ride.dropLng },
      fareEstimatePence: o.ride.fareEstimatePence,
      distanceToPickupM:
        loc && o.ride.pickupLat !== null && o.ride.pickupLng !== null
          ? Math.round(
              haversineMeters(
                { lat: loc.lat, lng: loc.lng },
                { lat: o.ride.pickupLat, lng: o.ride.pickupLng },
              ),
            )
          : null,
      expiresAt: o.expiresAt,
    }));
  }

  /** First driver to accept wins. The ride row lock makes the race safe. */
  async accept(driver: AuthUser, rideId: string): Promise<RideView> {
    await this.dataSource.transaction(async (m) => {
      const ride = await this.lockRide(m, rideId);
      if (!ride) throw new NotFoundException('Ride not found.');
      if (ride.status !== RideStatus.Requested) {
        throw new ConflictException('This ride is no longer available.');
      }
      const offer = await m.findOne(RideOffer, {
        where: { rideId, driverId: driver.id, response: OfferResponse.Pending },
      });
      if (!offer) throw new ConflictException('You do not hold an offer for this ride.');
      if (offer.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException('This offer has expired.');
      }
      const profile = await m.findOne(DriverProfile, { where: { userId: driver.id } });
      if (!profile || profile.onlineStatus !== DriverOnlineStatus.Online) {
        throw new ConflictException('You must be online to accept a ride.');
      }

      const now = new Date();
      ride.driverId = driver.id;
      ride.status = RideStatus.Assigned;
      ride.assignedAt = now;
      await m.save(ride);

      offer.response = OfferResponse.Accepted;
      offer.respondedAt = now;
      await m.save(offer);
      await m.update(
        RideOffer,
        { rideId, response: OfferResponse.Pending },
        { response: OfferResponse.Expired, respondedAt: now },
      );

      profile.onlineStatus = DriverOnlineStatus.OnTrip;
      await m.save(profile);
    });
    return this.toView(await this.loadRide(rideId), 'driver');
  }

  async reject(driver: AuthUser, rideId: string): Promise<void> {
    const offer = await this.offers.findOne({
      where: { rideId, driverId: driver.id, response: OfferResponse.Pending },
    });
    if (!offer) throw new NotFoundException('No open offer for this ride.');
    offer.response = OfferResponse.Rejected;
    offer.respondedAt = new Date();
    await this.offers.save(offer);
    await this.dispatch.redispatchIfUnheld(rideId);
  }

  async arrive(driver: AuthUser, rideId: string): Promise<RideView> {
    return this.step(driver, rideId, RideStatus.Assigned, RideStatus.Arrived, (r) => {
      r.arrivedAt = new Date();
    });
  }

  async start(driver: AuthUser, rideId: string): Promise<RideView> {
    return this.step(driver, rideId, RideStatus.Arrived, RideStatus.InProgress, (r) => {
      r.startedAt = new Date();
    });
  }

  async complete(driver: AuthUser, rideId: string, dto: CompleteRideDto): Promise<RideView> {
    await this.dataSource.transaction(async (m) => {
      const ride = await this.lockRideFor(m, rideId, driver.id);
      if (ride.status !== RideStatus.InProgress) {
        throw new ConflictException('Only a ride in progress can be completed.');
      }
      const rule = await this.activeRule(ride.rideType, m);
      const distanceM = dto.distanceM ?? ride.distanceM ?? 0;
      const fare = dto.distanceM
        ? priceFare(rule, dto.distanceM, ride.bookingMode === BookingMode.Later)
        : ride.fareEstimatePence;

      ride.status = RideStatus.Completed;
      ride.completedAt = new Date();
      ride.distanceM = distanceM || null;
      ride.fareFinalPence = fare;
      await m.save(ride);

      await m.save(
        Payment,
        m.create(Payment, {
          rideId: ride.id,
          reference: `TX-${randomBytes(5).toString('hex').toUpperCase()}`,
          amountPence: fare,
          status: PaymentStatus.Pending,
        }),
      );

      const profile = await m.findOneOrFail(DriverProfile, { where: { userId: driver.id } });
      profile.onlineStatus = DriverOnlineStatus.Online;
      profile.ridesCount += 1;
      await m.save(profile);
    });
    return this.toView(await this.loadRide(rideId), 'driver');
  }

  // ---- admin ----

  async listAll(q: AdminRidesQueryDto): Promise<Paged<RideView>> {
    const qb = this.rides
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.passenger', 'p')
      .leftJoinAndSelect('r.driver', 'd')
      .orderBy('r.requestedAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.q) {
      qb.andWhere(
        '(p.name ILIKE :term OR r.pickupAddress ILIKE :term OR r.dropAddress ILIKE :term)',
        { term: `%${q.q}%` },
      );
    }
    const [rows, total] = await qb.getManyAndCount();
    return paginate(
      rows.map((r) => this.toView(r as RideWithParties, 'admin')),
      total,
      q,
    );
  }

  async dispatchQueue(): Promise<(RideView & { waitingSeconds: number; offersOpen: number })[]> {
    const rows = await this.rides.find({
      where: { status: RideStatus.Requested },
      relations: { passenger: true, driver: true },
      order: { requestedAt: 'ASC' },
      take: 200,
    });
    const rank = {
      [DispatchPriority.Sos]: 0,
      [DispatchPriority.High]: 1,
      [DispatchPriority.Normal]: 2,
    };
    const ids = rows.map((r) => r.id);
    const open = ids.length
      ? await this.offers.find({ where: { rideId: In(ids), response: OfferResponse.Pending } })
      : [];
    const now = Date.now();
    return rows
      .sort((a, b) => rank[a.priority] - rank[b.priority])
      .map((r) => ({
        ...this.toView(r, 'admin'),
        waitingSeconds: Math.round((now - r.requestedAt.getTime()) / 1000),
        offersOpen: open.filter((o) => o.rideId === r.id).length,
      }));
  }

  async assign(admin: AuthUser, rideId: string, driverId: string): Promise<RideView> {
    await this.dataSource.transaction(async (m) => {
      const ride = await this.lockRide(m, rideId);
      if (!ride) throw new NotFoundException('Ride not found.');
      if (ride.status !== RideStatus.Requested) {
        throw new ConflictException('Only a requested ride can be assigned.');
      }
      const profile = await m.findOne(DriverProfile, {
        where: { userId: driverId },
        relations: { user: true },
      });
      if (!profile) throw new NotFoundException('Driver not found.');
      if (profile.user.status !== AccountStatus.Active) {
        throw new ConflictException('That driver account is not active.');
      }
      if (profile.onlineStatus !== DriverOnlineStatus.Online) {
        throw new ConflictException('That driver is not online.');
      }

      const now = new Date();
      ride.driverId = driverId;
      ride.status = RideStatus.Assigned;
      ride.assignedAt = now;
      await m.save(ride);
      await m.update(
        RideOffer,
        { rideId, response: OfferResponse.Pending },
        {
          response: OfferResponse.Expired,
          respondedAt: now,
        },
      );
      profile.onlineStatus = DriverOnlineStatus.OnTrip;
      await m.save(profile);

      await this.audit.record({
        actorId: admin.id,
        action: 'ride.assigned',
        entity: 'ride',
        entityId: rideId,
        payload: { driverId },
      });
    });
    return this.toView(await this.loadRide(rideId), 'admin');
  }

  // ---- helpers ----

  private async step(
    driver: AuthUser,
    rideId: string,
    from: RideStatus,
    to: RideStatus,
    stamp: (ride: Ride) => void,
  ): Promise<RideView> {
    await this.dataSource.transaction(async (m) => {
      const ride = await this.lockRideFor(m, rideId, driver.id);
      if (ride.status !== from) {
        throw new ConflictException(`This ride is ${ride.status}, not ${from}.`);
      }
      ride.status = to;
      stamp(ride);
      await m.save(ride);
    });
    return this.toView(await this.loadRide(rideId), 'driver');
  }

  private async lockRide(m: EntityManager, id: string): Promise<Ride | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return m.findOne(Ride, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  /** Locks the ride and checks it is assigned to this driver. */
  private async lockRideFor(m: EntityManager, id: string, driverId: string): Promise<Ride> {
    const ride = await this.lockRide(m, id);
    if (!ride || ride.driverId !== driverId) throw new NotFoundException('Ride not found.');
    return ride;
  }

  private async loadRide(id: string): Promise<RideWithParties> {
    const ride = await this.rides.findOne({
      where: { id },
      relations: { passenger: true, driver: true },
    });
    if (!ride) throw new NotFoundException('Ride not found.');
    return ride;
  }

  private viewerRole(user: AuthUser, ride: Ride): 'passenger' | 'driver' | 'admin' | null {
    if (user.roles.includes(UserRole.Admin)) return 'admin';
    if (ride.passengerId === user.id) return 'passenger';
    if (ride.driverId === user.id) return 'driver';
    return null;
  }

  private async activeRule(rideType: RideType, m?: EntityManager): Promise<PricingRule> {
    const repo = m ? m.getRepository(PricingRule) : this.pricing;
    const rule = await repo.findOne({
      where: { rideType, active: true },
      order: { effectiveFrom: 'DESC' },
    });
    if (!rule) throw new ConflictException(`No pricing is set up for ${rideType} rides.`);
    return rule;
  }

  private validateSchedule(mode: BookingMode, scheduledAt?: string): void {
    if (mode === BookingMode.Later) {
      if (!scheduledAt)
        throw new BadRequestException('Choose a date and time for a later booking.');
      const when = new Date(scheduledAt).getTime();
      if (when < Date.now() + SCHEDULE_MIN_LEAD_MS) {
        throw new BadRequestException('A later booking must be at least 15 minutes ahead.');
      }
    } else if (scheduledAt) {
      throw new BadRequestException('scheduledAt is only allowed for later bookings.');
    }
  }

  /**
   * Shows phone numbers only to the assigned counterpart and to admins.
   * Other viewers see names only.
   */
  private toView(ride: RideWithParties, viewer: 'passenger' | 'driver' | 'admin'): RideView {
    const showPassengerPhone = viewer === 'admin' || (viewer === 'driver' && !!ride.driverId);
    const showDriverPhone = viewer === 'admin' || (viewer === 'passenger' && !!ride.driverId);
    const driver = ride.driver ?? null;
    return {
      id: ride.id,
      status: ride.status,
      rideType: ride.rideType,
      bookingMode: ride.bookingMode,
      vehicleCategory: ride.vehicleCategory,
      priority: ride.priority,
      pickup: { address: ride.pickupAddress, lat: ride.pickupLat, lng: ride.pickupLng },
      drop: { address: ride.dropAddress, lat: ride.dropLat, lng: ride.dropLng },
      scheduledAt: ride.scheduledAt,
      distanceM: ride.distanceM,
      fareEstimatePence: ride.fareEstimatePence,
      fareFinalPence: ride.fareFinalPence,
      requestedAt: ride.requestedAt,
      assignedAt: ride.assignedAt,
      arrivedAt: ride.arrivedAt,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      cancelledAt: ride.cancelledAt,
      cancelReason: ride.cancelReason,
      passenger: {
        id: ride.passenger.id,
        name: ride.passenger.name,
        ...(showPassengerPhone && { phone: ride.passenger.phone }),
      },
      driver: driver
        ? {
            id: driver.id,
            name: driver.name,
            ...(showDriverPhone && { phone: driver.phone }),
          }
        : null,
    };
  }
}
