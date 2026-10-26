import { describe, expect, it } from 'vitest';
import type { AdminRole } from '@cabzone/contracts';
import { decodeJwtAdminRole } from '../../features/auth/lib/authApi';
import { filterNavSectionsForRole, navSections } from '../nav-items';

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('Admin Web RBAC helpers', () => {
  it('decodes valid AdminRole claims from JWTs and rejects non-admin or malformed tokens', () => {
    expect(decodeJwtAdminRole(fakeJwt({ sub: 'u1', role: 'CITY_ADMIN' }))).toBe('CITY_ADMIN');
    expect(decodeJwtAdminRole(fakeJwt({ sub: 'u2', role: 'FINANCE_ADMIN' }))).toBe(
      'FINANCE_ADMIN',
    );
    expect(decodeJwtAdminRole(fakeJwt({ sub: 'u3', role: 'DRIVER' }))).toBeNull();
    expect(decodeJwtAdminRole('not-a-jwt')).toBeNull();
    expect(decodeJwtAdminRole(null)).toBeNull();
  });

  it('filters side navigation surfaces accurately for each AdminRole', () => {
    const hrefsFor = (role: AdminRole | null) =>
      filterNavSectionsForRole(navSections, role).flatMap((s) => s.items.map((i) => i.href));

    const cityHrefs = hrefsFor('CITY_ADMIN');
    expect(cityHrefs).toContain('/zones');
    expect(cityHrefs).toContain('/pricing');
    expect(cityHrefs).toContain('/rides');
    expect(cityHrefs).toContain('/health');
    expect(cityHrefs).not.toContain('/finance');
    expect(cityHrefs).not.toContain('/drivers');
    expect(cityHrefs).not.toContain('/riders');

    const financeHrefs = hrefsFor('FINANCE_ADMIN');
    expect(financeHrefs).toContain('/finance');
    expect(financeHrefs).toContain('/drivers');
    expect(financeHrefs).toContain('/rides');
    expect(financeHrefs).toContain('/health');
    expect(financeHrefs).not.toContain('/zones');
    expect(financeHrefs).not.toContain('/pricing');
    expect(financeHrefs).not.toContain('/riders');

    const supportHrefs = hrefsFor('SUPPORT_ADMIN');
    expect(supportHrefs).toContain('/rides');
    expect(supportHrefs).toContain('/drivers');
    expect(supportHrefs).toContain('/riders');
    expect(supportHrefs).toContain('/health');
    expect(supportHrefs).not.toContain('/finance');
    expect(supportHrefs).not.toContain('/zones');
    expect(supportHrefs).not.toContain('/pricing');

    const superHrefs = hrefsFor('SUPER_ADMIN');
    expect(superHrefs).toEqual(
      expect.arrayContaining([
        '/rides',
        '/drivers',
        '/riders',
        '/zones',
        '/pricing',
        '/finance',
        '/admins',
        '/health',
      ]),
    );
  });
});
