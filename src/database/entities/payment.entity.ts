import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '../enums';
import { Ride } from './ride.entity';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_payments_ride', { unique: true })
  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @OneToOne(() => Ride, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Ride;

  @Index('UQ_payments_reference', { unique: true })
  @Column({ type: 'varchar', length: 32 })
  reference!: string; // e.g. TX-10021

  @Column({ name: 'amount_pence', type: 'integer' })
  amountPence!: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.Pending })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  method!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
