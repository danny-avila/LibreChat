import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';

/**
 * An in-app path (with its search string) that is safe to navigate to after
 * login, or `/`. Anything that could leave the app (`//host`, `/\host`,
 * `https://…`, `javascript:`) falls back to `/`.
 */
export function toSafeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

const PRINCIPAL_TYPES: ReadonlySet<string> = new Set([
  PrincipalType.ROLE,
  PrincipalType.GROUP,
  PrincipalType.USER,
]);

function isScopePrincipalType(value: string): value is t.ScopePrincipalType {
  return PRINCIPAL_TYPES.has(value);
}

/**
 * Parses `?scope=`: `role:USER`, `group:<id>`, `user:<id>`, or a legacy
 * profile `_id`. Returns null for an empty value.
 */
export function parseScopeParam(value: string | undefined): t.ScopeParam | null {
  if (!value) return null;
  const colon = value.indexOf(':');
  if (colon > 0) {
    const principalType = value.slice(0, colon);
    const principalId = value.slice(colon + 1);
    if (isScopePrincipalType(principalType) && principalId) {
      return { kind: 'principal', principalType, principalId };
    }
  }
  return { kind: 'id', id: value };
}

/** `?scope=` value of a profile: `role:USER`, `group:<id>`, `user:<id>`. */
export function formatScopeParam(scope: Pick<t.ConfigScope, 'principalType' | 'principalId'>) {
  return `${scope.principalType}:${scope.principalId}`;
}

/** The profile a parsed `?scope=` refers to, if it exists. */
export function findScopeByParam(
  scopes: readonly t.ConfigScope[],
  param: t.ScopeParam,
): t.ConfigScope | undefined {
  if (param.kind === 'id') return scopes.find((scope) => scope._id === param.id);
  return scopes.find(
    (scope) =>
      scope.principalType === param.principalType && scope.principalId === param.principalId,
  );
}

/** Canonical form of a `?scope=` value for comparisons (`undefined` = Base). */
export function scopeParamKey(value: string | undefined): string | undefined {
  const param = parseScopeParam(value);
  if (!param) return undefined;
  return param.kind === 'id' ? `id:${param.id}` : formatScopeParam(param);
}
