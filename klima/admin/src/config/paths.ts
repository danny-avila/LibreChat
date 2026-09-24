import type { PrincipalRef } from './types';

const CONFIG_ROOT = '/api/admin/config';

/** `/:principalType/:principalId` — the base every config mutation route hangs off. */
export const configPath = (principal: PrincipalRef): string =>
  `${CONFIG_ROOT}/${encodeURIComponent(principal.kind)}/${encodeURIComponent(principal.id)}`;

export const configListPath = (): string => CONFIG_ROOT;
