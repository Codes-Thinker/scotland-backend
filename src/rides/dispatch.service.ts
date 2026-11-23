import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import type { Configuration } from '@/config/configuration';
import {
  Block,
  DriverDocument,
  DriverLocation,
  DriverProfile,
} from '@/database/entities/account.entity';
import { RideOffer, Ride } from '@/database/entities/ride.entity';
import {
  AccountStatus,
  BookingMode,
  DriverOnlineStatus,
  OfferResponse,
  RideStatus,
} from '@/database/enums';
import { allDocumentsValid } from '@/drivers/driver-views';
import { RealtimeService } from '@/realtime/realtime.service';
import { haversineMeters } from './geo-pricing';

/** Stalled requests are retried for this long, then left for admin dispatch. */
const RETRY_WINDOW_MS = 30 * 60_000;

/**
 * Offers a ride to the nearest eligible drivers. Eligible means online, approved, with
 * all documents valid, a fresh location inside the radius, and no block from this passenger.
 * A driver never receives the same ride twice.
 */
@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly config: ConfigService<Configuration, true>,
    private readonly realtime: RealtimeService,
    @InjectRepository(Ride) private readonly rides: Repository<Ride>,
    @InjectRepository(RideOffer) private readonly offers: Repository<RideOffer>,
    @InjectRepository(DriverProfile) private readonly profiles: Repository<DriverProfile>,
    @InjectRepository(DriverLocation) private readonly locations: Repository<DriverLocation>,
    @InjectRepository(DriverDocument) private readonly documents: Repository<DriverDocument>,
    @InjectRepository(Block) private readonly blocks: Repository<Block>,
  ) {}

  onModuleInit(): void {
    const ms = this.config.get('dispatch.sweepMs', { infer: true });
    if (ms > 0) {
      this.timer = setInterval(() => {
        void this.sweep().catch((err: unknown) => this.logger.error('Dispatch sweep failed', err));
      }, ms);
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends fresh offers for a requested ride. Returns how many offers were created. */
  async dispatch(rideId: string): Promise<number> {
    const ride = await this.rides.findOne({ where: { id: rideId } });
    if (!ride || ride.status !== RideStatus.Requested) return 0;
    if (ride.bookingMode === BookingMode.Later) return 0; // scheduled rides are assigned by admin
    if (ride.pickupLat === null || ride.pickupLng === null) return 0;

    const now = new Date();
    const pickup = { lat: ride.pickupLat, lng: ride.pickupLng };
    const maxAgeMs = this.config.get('dispatch.locationMaxAgeSec', { infer: true }) * 1000;
    const radiusM = this.config.get('dispatch.radiusKm', { infer: true }) * 1000;
    const maxOffers = this.config.get('dispatch.maxOffers', { infer: true });
    const offerMs = this.config.get('dispatch.offerSeconds', { infer: true }) * 1000;

    const online = await this.profiles.find({
      where: { onlineStatus: DriverOnlineStatus.Online },
      relations: { user: true },
    });
    const approvedIds = online
      .filter((p) => p.user.status === AccountStatus.Active)
      .map((p) => p.userId);
    if (approvedIds.length === 0) return 0;

    const fresh = await this.locations.find({
      where: {
        driverId: In(approvedIds),
        updatedAt: MoreThanOrEqual(new Date(now.getTime() - maxAgeMs)),
      },
    });

    const [priorOffers, blocked, docs] = await Promise.all([
      this.offers.find({ where: { rideId }, select: { driverId: true } }),
      this.blocks.find({ where: { passengerId: ride.passengerId }, select: { driverId: true } }),
      this.documents.find({ where: { driverId: In(approvedIds) } }),
    ]);
    const excluded = new Set<string>([
      ...priorOffers.map((o) => o.driverId),
      ...blocked.map((b) => b.driverId),
    ]);

    const candidates = fresh
      .filter((l) => !excluded.has(l.driverId))
      .map((l) => ({
        driverId: l.driverId,
        distanceM: haversineMeters(pickup, { lat: l.lat, lng: l.lng }),
      }))
      .filter((c) => c.distanceM <= radiusM)
      .filter((c) =>
        allDocumentsValid(
          docs.filter((d) => d.driverId === c.driverId),
          now,
        ),
      )
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, maxOffers);

    if (candidates.length === 0) return 0;

    const saved = await this.offers.save(
      candidates.map((c) =>
        this.offers.create({
          rideId,
          driverId: c.driverId,
          expiresAt: new Date(now.getTime() + offerMs),
          response: OfferResponse.Pending,
        }),
      ),
    );
    for (const o of saved) {
      this.realtime.toUser(o.driverId, 'ride.offer', {
        offerId: o.id,
        rideId,
        rideType: ride.rideType,
        pickup: { address: ride.pickupAddress, lat: ride.pickupLat, lng: ride.pickupLng },
        drop: { address: ride.dropAddress, lat: ride.dropLat, lng: ride.dropLng },
        fareEstimatePence: ride.fareEstimatePence,
        expiresAt: o.expiresAt,
      });
    }
    return candidates.length;
  }

  /** Called when an offer closes (rejected or expired). Re-dispatches if nobody is left holding one. */
  async redispatchIfUnheld(rideId: string): Promise<void> {
    const ride = await this.rides.findOne({ where: { id: rideId } });
    if (!ride || ride.status !== RideStatus.Requested) return;
    const pending = await this.offers.count({ where: { rideId, response: OfferResponse.Pending } });
    if (pending === 0) await this.dispatch(rideId);
  }

  /** Expires overdue offers, re-dispatches affected rides, and retries recent stalled requests. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const now = new Date();
      const overdue = await this.offers.find({
        where: { response: OfferResponse.Pending, expiresAt: LessThan(now) },
      });
      if (overdue.length > 0) {
        await this.offers.update(
          { id: In(overdue.map((o) => o.id)) },
          { response: OfferResponse.Expired, respondedAt: now },
        );
      }
      const affected = new Set(overdue.map((o) => o.rideId));

      const stalled = await this.rides.find({
        where: {
          status: RideStatus.Requested,
          bookingMode: BookingMode.Now,
          requestedAt: MoreThanOrEqual(new Date(now.getTime() - RETRY_WINDOW_MS)),
        },
        take: 50,
        select: { id: true },
      });
      for (const r of stalled) affected.add(r.id);

      for (const rideId of affected) {
        await this.redispatchIfUnheld(rideId);
      }
    } finally {
      this.sweeping = false;
    }
  }
}
