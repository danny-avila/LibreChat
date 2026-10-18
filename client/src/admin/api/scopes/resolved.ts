import { z } from 'zod';
import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { collectLeafPaths, getValueAtPath } from '~/admin/utils';
import { normalizeAppServiceKeys } from '../config/normalize';
import { createServerFn } from '~/admin/api/utils/fn';
import { apiFetch } from '../utils/api';

const EMPTY_SCOPE_CONFIG: t.ResolvedConfigData = {
  resolvedConfig: {},
  changedPaths: [],
  overrides: {},
  tombstones: [],
};

/**
 * Fetch one profile's own config document: its overrides (canonical keys) and
 * tombstones, plus the legacy flattened view of the overrides. What a profile
 * inherits is the base config the page already holds; the client merges the
 * two (`mergeScopeLayer`) the way LibreChat does, since lower-priority profiles
 * vary per user and are not part of a profile's inheritance (EV-5).
 */
export const getResolvedConfigFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      principalType: z.nativeEnum(PrincipalType),
      principalId: z.string(),
    }),
  )
  .handler(
    async ({
      data,
    }: {
      data: { principalType: PrincipalType; principalId: string };
    }): Promise<t.ResolvedConfigData> => {
      const response = await apiFetch(
        `/api/admin/config/${data.principalType}/${encodeURIComponent(data.principalId)}`,
      );

      if (response.status === 404) return EMPTY_SCOPE_CONFIG;
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status}`);
      }

      const { config } = (await response.json()) as t.AdminConfigDocResponse;
      const overrides = normalizeAppServiceKeys((config.overrides ?? {}) as t.ConfigRecord);
      const changedPaths = collectLeafPaths(overrides);
      const resolvedConfig: t.FlatConfigMap = {};
      for (const path of changedPaths) resolvedConfig[path] = getValueAtPath(overrides, path);

      return { resolvedConfig, changedPaths, overrides, tombstones: config.tombstones ?? [] };
    },
  );
