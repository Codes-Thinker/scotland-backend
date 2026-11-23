import { DriverDocument, DriverProfile, User, Vehicle } from '@/database/entities/account.entity';
import {
  AccountStatus,
  DriverDocumentStatus,
  DriverDocumentType,
  DriverOnlineStatus,
} from '@/database/enums';

/** The five documents every driver must have verified before going online (contract §2.3). */
export const REQUIRED_DOCUMENTS = Object.values(DriverDocumentType);

export interface DocumentView {
  type: DriverDocumentType;
  status: DriverDocumentStatus;
  expiresAt: Date | null;
  uploadedAt: Date | null;
  reviewedAt: Date | null;
}

export function toDocumentView(type: DriverDocumentType, row?: DriverDocument): DocumentView {
  return {
    type,
    status: row?.status ?? DriverDocumentStatus.Missing,
    expiresAt: row?.expiresAt ?? null,
    uploadedAt: row?.fileKey ? row.updatedAt : null,
    reviewedAt: row?.reviewedAt ?? null,
  };
}

/** All required documents are verified and none has passed its expiry date. */
export function allDocumentsValid(docs: DriverDocument[], now: Date = new Date()): boolean {
  return REQUIRED_DOCUMENTS.every((type) => {
    const row = docs.find((d) => d.type === type);
    if (!row || row.status !== DriverDocumentStatus.Verified) return false;
    return !row.expiresAt || row.expiresAt.getTime() > now.getTime();
  });
}

export function countVerified(docs: DriverDocument[], now: Date = new Date()): number {
  return REQUIRED_DOCUMENTS.filter((type) => {
    const row = docs.find((d) => d.type === type);
    return (
      row?.status === DriverDocumentStatus.Verified &&
      (!row.expiresAt || row.expiresAt.getTime() > now.getTime())
    );
  }).length;
}

export interface DriverSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  accountStatus: AccountStatus;
  onlineStatus: DriverOnlineStatus;
  operatingZone: string | null;
  ratingAvg: number;
  ridesCount: number;
  vehicle: { makeModel: string; plate: string; category: string } | null;
  documentsVerified: number;
  documentsRequired: number;
}

export function toDriverSummary(
  user: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'status'>,
  profile: Pick<DriverProfile, 'onlineStatus' | 'operatingZone' | 'ratingAvg' | 'ridesCount'>,
  vehicle: Pick<Vehicle, 'makeModel' | 'plate' | 'category'> | undefined,
  docs: DriverDocument[],
  now: Date = new Date(),
): DriverSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    accountStatus: user.status,
    onlineStatus: profile.onlineStatus,
    operatingZone: profile.operatingZone,
    ratingAvg: profile.ratingAvg,
    ridesCount: profile.ridesCount,
    vehicle: vehicle
      ? { makeModel: vehicle.makeModel, plate: vehicle.plate, category: vehicle.category }
      : null,
    documentsVerified: countVerified(docs, now),
    documentsRequired: REQUIRED_DOCUMENTS.length,
  };
}
