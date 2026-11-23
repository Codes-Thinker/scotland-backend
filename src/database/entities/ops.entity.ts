import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlaceKind, RideType } from '../enums';
import { User } from './account.entity';

/** Searchable places for pickup and drop-off. Coordinates are filled later (decision D6). */
@Entity({ name: 'places' })
export class Place {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Index('IDX_places_postcode')
  @Column({ type: 'varchar', length: 16, nullable: true })
  postcode!: string | null;

  @Column({ type: 'double precision', nullable: true })
  lat!: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng!: number | null;

  @Column({ type: 'enum', enum: PlaceKind, default: PlaceKind.Popular })
  kind!: PlaceKind;
}

/** Base fare rules per ride type. Edited from the admin Pricing page. */
@Entity({ name: 'pricing_rules' })
@Check('CHK_pricing_non_negative', '"base_fare_pence" >= 0 AND "per_mile_pence" >= 0')
export class PricingRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_type', type: 'enum', enum: RideType })
  rideType!: RideType;

  @Column({ name: 'base_fare_pence', type: 'integer' })
  baseFarePence!: number;

  @Column({ name: 'per_mile_pence', type: 'integer', default: 0 })
  perMilePence!: number;

  @Column({ name: 'minimum_fare_pence', type: 'integer', default: 0 })
  minimumFarePence!: number;

  /** Basis points, e.g. 500 = +5% for later bookings. */
  @Column({ name: 'later_booking_surcharge_bp', type: 'integer', default: 0 })
  laterBookingSurchargeBp!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notes!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;
}

/** Every admin write. Append-only. */
@Entity({ name: 'audit_log' })
@Index('IDX_audit_log_entity', ['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'varchar', length: 64 })
  entity!: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 64 })
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
