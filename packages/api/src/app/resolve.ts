import { tenantStorage } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';

interface UserForConfigResolution {
  tenantId?: string;
  role?: string;
}

type GetAppConfig = (opts: {
  role?: string;
  tenantId?: string;
  baseOnly?: boolean;
}) => Promise<AppConfig>;

/**
 * Resolves AppConfig scoped to the given user's tenant when available,
 * falling back to YAML-only base config for new users or non-tenant deployments.
 *
 * Auth flows only apply role-level overrides (userId is not passed) because
 * user/group principal resolution requires heavier DB work that is deferred
 * to post-authentication config calls.
 *
 * `tenantId` is propagated through two channels that serve different purposes:
 * - `tenantStorage.run()` sets the ALS context so Mongoose's `applyTenantIsolation`
 *   plugin scopes any DB queries (e.g., `getApplicableConfigs`) to the tenant.
 * - The explicit `tenantId` parameter to `getAppConfig` is used for cache-key
 *   computation in `overrideCacheKey()`. Both channels are required.
 */
export async function resolveAppConfigForUser(
  getAppConfig: GetAppConfig,
  user: UserForConfigResolution | null | undefined,
): Promise<AppConfig> {
  if (user?.tenantId) {
    return tenantStorage.run({ tenantId: user.tenantId }, async () =>
      getAppConfig({ role: user.role, tenantId: user.tenantId }),
    );
  }
  return getAppConfig({ baseOnly: true });
}
