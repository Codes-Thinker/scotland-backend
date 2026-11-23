import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatSenderType } from '../enums';
import { Ride } from './ride.entity';

/** One chat thread per ride. */
@Entity({ name: 'chat_threads' })
export class ChatThread {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_chat_threads_ride', { unique: true })
  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @OneToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Ride;

  @OneToMany(() => ChatMessage, (m) => m.thread)
  messages?: ChatMessage[];
}

@Entity({ name: 'chat_messages' })
@Index('IDX_chat_messages_thread_created', ['threadId', 'createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId!: string;

  @ManyToOne(() => ChatThread, (t) => t.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thread_id' })
  thread!: ChatThread;

  @Column({ name: 'sender_type', type: 'enum', enum: ChatSenderType })
  senderType!: ChatSenderType;

  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
