import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountStatus, UserRole } from '@/database/enums';
import { RolesGuard } from './roles.guard';

function contextWith(user: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const build = (required: UserRole[] | undefined) => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };
  const admin = { id: '1', roles: [UserRole.Admin], status: AccountStatus.Active };
  const driver = { id: '2', roles: [UserRole.Driver], status: AccountStatus.Active };

  it('allows any authenticated user when no roles are required', () => {
    expect(build(undefined).canActivate(contextWith(driver))).toBe(true);
  });

  it('allows a user holding one of the required roles', () => {
    expect(build([UserRole.Admin]).canActivate(contextWith(admin))).toBe(true);
  });

  it('denies a user without the required role', () => {
    expect(build([UserRole.Admin]).canActivate(contextWith(driver))).toBe(false);
  });

  it('accepts multi-role accounts (roles[]) when any role matches', () => {
    const both = { ...driver, roles: [UserRole.Passenger, UserRole.Driver] };
    expect(build([UserRole.Driver]).canActivate(contextWith(both))).toBe(true);
  });

  it('denies when there is no authenticated user', () => {
    expect(build([UserRole.Admin]).canActivate(contextWith(undefined))).toBe(false);
  });
});
