import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {
  BookingMode,
  DispatchPriority,
  OfferResponse,
  RatedByRole,
  RideStatus,
  RideType,
  VehicleCategory,
} from '../enums';
import { User } from './account.entity';

@Entity({ name: 'rides' })
@Index('IDX_rides_status_requested', ['status', 'requestedAt'])
@Index('IDX_rides_driver_status', ['driverId', 'status'])
@Check('CHK_rides_fare_estimate', '"fare_estimate_pence" >= 0')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'passenger_id', type: 'uuid' })
  passengerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'passenger_id' })
  passenger!: User;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver?: User | null;

  @Column({ type: 'enum', enum: RideStatus, default: RideStatus.Requested })
  status!: RideStatus;

  @Column({ name: 'ride_type', type: 'enum', enum: RideType, default: RideType.Standard })
  rideType!: RideType;

  @Column({ name: 'booking_mode', type: 'enum', enum: BookingMode, default: BookingMode.Now })
  bookingMode!: BookingMode;

  @Column({
    name: 'vehicle_category',
    type: 'enum',
    enum: VehicleCategory,
    default: VehicleCategory.FourSeater,
  })
  vehicleCategory!: VehicleCategory;

  @Column({ type: 'enum', enum: DispatchPriority, default: DispatchPriority.Normal })
  priority!: DispatchPriority;

  @Column({ name: 'pickup_address', type: 'varchar', length: 255 })
  pickupAddress!: string;

  @Column({ name: 'pickup_lat', type: 'double precision', nullable: true })
  pickupLat!: number | null;

  @Column({ name: 'pickup_lng', type: 'double precision', nullable: true })
  pickupLng!: number | null;

  @Column({ name: 'drop_address', type: 'varchar', length: 255 })
  dropAddress!: string;

  @Column({ name: 'drop_lat', type: 'double precision', nullable: true })
  dropLat!: number | null;

  @Column({ name: 'drop_lng', type: 'double precision', nullable: true })
  dropLng!: number | null;

  /** Set only for bookingMode = later. Real timestamp, UTC. */
  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'fare_estimate_pence', type: 'integer' })
  fareEstimatePence!: number;

  @Column({ name: 'fare_final_pence', type: 'integer', nullable: true })
  fareFinalPence!: number | null;

  @Column({ name: 'distance_m', type: 'integer', nullable: true })
  distanceM!: number | null;

  @CreateDateColumn({ name: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt!: Date | null;

  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 255, nullable: true })
  cancelReason!: string | null;
}

@Entity({ name: 'ride_stops' })
@Unique('UQ_ride_stops_ride_position', ['rideId', 'position'])
export class RideStop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Ride;

  @Column({ type: 'smallint' })
  position!: number;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({ type: 'double precision', nullable: true })
  lat!: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng!: number | null;
}

@Entity({ name: 'ride_offers' })
@Index('IDX_ride_offers_ride', ['rideId'])
export class RideOffer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Ride;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver!: User;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'enum', enum: OfferResponse, default: OfferResponse.Pending })
  response!: OfferResponse;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;
}

@Entity({ name: 'ride_ratings' })
@Check('CHK_ride_ratings_score', '"score" BETWEEN 1 AND 5')
export class RideRating {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_ride_ratings_ride', { unique: true })
  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @OneToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Ride;

  @Column({ name: 'rated_by_user_id', type: 'uuid' })
  ratedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rated_by_user_id' })
  ratedBy!: User;

  @Column({ name: 'rated_by_role', type: 'enum', enum: RatedByRole })
  ratedByRole!: RatedByRole;

  @Column({ type: 'smallint' })
  score!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
