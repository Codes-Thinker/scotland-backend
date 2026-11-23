import { AccountStatus, UserRole } from '@/database/enums';

/** Attached to request.user by JwtStrategy. Loaded from the database on every request. */
export interface AuthUser {
  id: string;
  roles: UserRole[];
  status: AccountStatus;
}
