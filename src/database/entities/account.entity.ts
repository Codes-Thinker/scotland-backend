import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  AccountStatus,
  DriverDocumentStatus,
  DriverDocumentType,
  DriverOnlineStatus,
  UserRole,
  VehicleCategory,
} from '../enums';
import { decimalTransformer } from '../transformers';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string; // stored lowercase

  @Column({ type: 'varchar', length: 32 })
  phone!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    array: true,
    default: () => `'{${UserRole.Passenger}}'`,
  })
  roles!: UserRole[];

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.Active })
  status!: AccountStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => DriverProfile, (p) => p.user)
  // Union type avoids eager metadata reference before DriverProfile is defined below.
  driverProfile?: DriverProfile | null;
}

/** Exists only for users whose roles include `driver`. */
@Entity({ name: 'driver_profiles' })
@Check('CHK_driver_rating', '"rating_avg" >= 0 AND "rating_avg" <= 5')
export class DriverProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, (u) => u.driverProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'licence_number', type: 'varchar', length: 64, nullable: true })
  licenceNumber!: string | null;

  @Column({ name: 'operating_zone', type: 'varchar', length: 64, nullable: true })
  operatingZone!: string | null;

  @Column({
    name: 'online_status',
    type: 'enum',
    enum: DriverOnlineStatus,
    default: DriverOnlineStatus.Offline,
  })
  onlineStatus!: DriverOnlineStatus;

  @Column({
    name: 'rating_avg',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  ratingAvg!: number;

  @Column({ name: 'rides_count', type: 'int', default: 0 })
  ridesCount!: number;

  @OneToMany(() => Vehicle, (v) => v.driver)
  vehicles?: Vehicle[];
}

@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_vehicles_driver')
  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @ManyToOne(() => DriverProfile, (p) => p.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver!: DriverProfile;

  @Column({ name: 'make_model', type: 'varchar', length: 120 })
  makeModel!: string;

  @Index('UQ_vehicles_plate', { unique: true })
  @Column({ type: 'varchar', length: 16 })
  plate!: string;

  @Column({ type: 'enum', enum: VehicleCategory, default: VehicleCategory.FourSeater })
  category!: VehicleCategory;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'driver_documents' })
@Unique('UQ_driver_documents_driver_type', ['driverId', 'type'])
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver!: User;

  @Column({ type: 'enum', enum: DriverDocumentType })
  type!: DriverDocumentType;

  @Column({ type: 'enum', enum: DriverDocumentStatus, default: DriverDocumentStatus.Missing })
  status!: DriverDocumentStatus;

  /** Object-storage key. Never a public URL. */
  @Column({ name: 'file_key', type: 'varchar', length: 512, nullable: true })
  fileKey!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

/** Latest position only. */
@Entity({ name: 'driver_locations' })
export class DriverLocation {
  @PrimaryColumn({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver!: User;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'smallint', nullable: true })
  heading!: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

/** Driver blocks a passenger. */
@Entity({ name: 'blocks' })
@Unique('UQ_blocks_driver_passenger', ['driverId', 'passengerId'])
export class Block {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver!: User;

  @Column({ name: 'passenger_id', type: 'uuid' })
  passengerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'passenger_id' })
  passenger!: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
