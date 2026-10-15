import { normalizeEndpointName } from 'librechat-data-provider';

export interface UserEndpointAccessRule {
  username?: string;
  allowedEndpoints?: string[];
}

export interface UserEndpointAccessUser {
  username?: string | null;
}

export interface UserModelSpecsConfig {
  list?: Array<{ preset?: { endpoint?: string | null } }>;
  addedEndpoints?: string[];
}

export function getUserEndpointAllowlist(
  user: UserEndpointAccessUser | null | undefined,
  rules: readonly UserEndpointAccessRule[] | null | undefined,
): Set<string> | undefined {
  const username = user?.username?.trim().toLowerCase();
  if (!username || !rules?.length) {
    return undefined;
  }

  const rule = rules.find(
    (candidate) =>
      typeof candidate.username === 'string' &&
      candidate.username.trim().toLowerCase() === username,
  );
  if (!rule) {
    return undefined;
  }

  return new Set(
    (rule.allowedEndpoints ?? []).map((endpoint) => normalizeEndpointName(endpoint).toLowerCase()),
  );
}

export function isEndpointAllowedForUser(
  user: UserEndpointAccessUser | null | undefined,
  endpoint: string,
  rules: readonly UserEndpointAccessRule[] | null | undefined,
): boolean {
  const allowlist = getUserEndpointAllowlist(user, rules);
  return allowlist == null || allowlist.has(normalizeEndpointName(endpoint).toLowerCase());
}

export function filterEndpointCatalog<T>(
  catalog: Record<string, T>,
  allowedEndpoints: Iterable<string> | undefined,
): Record<string, T> {
  if (allowedEndpoints == null) {
    return catalog;
  }

  const allowlist = new Set(
    Array.from(allowedEndpoints, (endpoint) => normalizeEndpointName(endpoint).toLowerCase()),
  );
  return Object.fromEntries(
    Object.entries(catalog).filter(([endpoint]) =>
      allowlist.has(normalizeEndpointName(endpoint).toLowerCase()),
    ),
  ) as Record<string, T>;
}

export function filterModelSpecsForUser<T extends UserModelSpecsConfig | undefined>(
  modelSpecs: T,
  user: UserEndpointAccessUser | null | undefined,
  rules: readonly UserEndpointAccessRule[] | null | undefined,
): T {
  const allowlist = getUserEndpointAllowlist(user, rules);
  if (allowlist == null || modelSpecs == null) {
    return modelSpecs;
  }

  const list = modelSpecs.list?.filter((spec) => {
    const endpoint = spec.preset?.endpoint;
    return endpoint != null && allowlist.has(normalizeEndpointName(endpoint).toLowerCase());
  });
  const addedEndpoints = modelSpecs.addedEndpoints?.filter((endpoint) =>
    allowlist.has(normalizeEndpointName(endpoint).toLowerCase()),
  );

  if (
    list?.length === modelSpecs.list?.length &&
    addedEndpoints?.length === modelSpecs.addedEndpoints?.length
  ) {
    return modelSpecs;
  }

  return { ...modelSpecs, list, addedEndpoints } as T;
}
