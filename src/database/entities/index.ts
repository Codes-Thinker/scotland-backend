import { Alert } from './alert.entity';
import { RefreshToken } from './auth.entity';
import {
  Block,
  DriverDocument,
  DriverLocation,
  DriverProfile,
  User,
  Vehicle,
} from './account.entity';
import { ChatMessage, ChatThread } from './chat.entity';
import { AuditLog, Place, PricingRule } from './ops.entity';
import { Payment } from './payment.entity';
import { Ride, RideOffer, RideRating, RideStop } from './ride.entity';

/**
 * Every entity, listed explicitly. TypeORM's file-glob loader cannot require .ts under
 * test runners, and an explicit list fails loudly if a new entity is forgotten.
 */
export const ENTITIES = [
  User,
  DriverProfile,
  Vehicle,
  DriverDocument,
  DriverLocation,
  Block,
  Ride,
  RideStop,
  RideOffer,
  RideRating,
  Payment,
  ChatThread,
  ChatMessage,
  Alert,
  Place,
  PricingRule,
  AuditLog,
  RefreshToken,
];
