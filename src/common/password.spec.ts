import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the original password', async () => {
    const hash = await hashPassword('correct-horse');
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct-horse');
    expect(await verifyPassword('wrong-horse', hash)).toBe(false);
  });

  it('uses a fresh salt, so equal passwords hash differently', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'md5$abc$def')).toBe(false);
  });
});
