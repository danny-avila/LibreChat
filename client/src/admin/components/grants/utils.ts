import { PrincipalType } from 'librechat-data-provider';
import type { AdminSystemGrant } from 'librechat-data-provider';
import type * as t from '~/admin/types';

export function buildRoleNames(
  roles: t.Role[],
): Record<string, { name: string; isActive: boolean }> {
  const m: Record<string, { name: string; isActive: boolean }> = {};
  for (const r of roles) m[r.id] = { name: r.name, isActive: r.isActive };
  return m;
}

export function filterPrincipals(principals: t.PrincipalRow[], search: string): t.PrincipalRow[] {
  if (!search.trim()) {
    return principals;
  }
  const q = search.toLowerCase();
  return principals.filter((p) => p.name.toLowerCase().includes(q));
}

export function aggregatePrincipals(
  grants: AdminSystemGrant[],
  roleNames: Record<string, { name: string; isActive: boolean }>,
): t.PrincipalRow[] {
  const map = new Map<string, t.PrincipalRow>();

  for (const [id, r] of Object.entries(roleNames)) {
    map.set(`${PrincipalType.ROLE}:${id}`, {
      principalType: PrincipalType.ROLE,
      principalId: id,
      name: r.name,
      grantCount: 0,
      isActive: r.isActive,
    });
  }

  for (const g of grants) {
    if (g.principalType !== PrincipalType.ROLE) {
      continue;
    }
    const key = `${PrincipalType.ROLE}:${g.principalId}`;
    const row = map.get(key);
    if (row) {
      row.grantCount++;
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
