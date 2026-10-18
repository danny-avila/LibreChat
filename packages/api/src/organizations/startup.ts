import { logger } from '@librechat/data-schemas';
import type { TOrganizationAdminCapability } from 'librechat-data-provider';
import type { AppConfig, SystemCapability } from '@librechat/data-schemas';
import { isEnabled } from '~/utils/common';

type RuntimeEnv = Record<string, string | undefined>;
type RuntimeConfig = Pick<AppConfig, 'organizations' | 'endpoints'>;

/**
 * Every reason this process cannot run organizations mode safely; empty when it can, or when
 * organizations are disabled. Each entry names the setting and why it conflicts.
 */
export function findOrganizationsRuntimeConflicts(
  appConfig: RuntimeConfig,
  env: RuntimeEnv,
): string[] {
  if (!appConfig.organizations?.enabled) {
    return [];
  }

  const conflicts: string[] = [];
  if (env.TENANT_ISOLATION_STRICT !== 'true') {
    conflicts.push(
      'TENANT_ISOLATION_STRICT must be "true", so a query that runs without an organization context fails instead of reading every organization',
    );
  }
  if (isEnabled(env.TRUST_TENANT_HEADER)) {
    conflicts.push(
      'TRUST_TENANT_HEADER must be disabled: the organization comes from the signed-in member, never from a request header',
    );
  }
  if (isEnabled(env.OPENID_REUSE_TOKENS)) {
    conflicts.push(
      'OPENID_REUSE_TOKENS must be disabled: an identity provider token cannot name the active organization',
    );
  }
  if (isEnabled(env.ALLOW_SOCIAL_LOGIN)) {
    conflicts.push(
      'ALLOW_SOCIAL_LOGIN must be disabled: social, OpenID and SAML sign-in do not support organizations yet',
    );
  }
  if (env.LDAP_URL && env.LDAP_USER_SEARCH_BASE) {
    conflicts.push(
      'LDAP sign-in (LDAP_URL with LDAP_USER_SEARCH_BASE) must be disabled: it does not support organizations yet',
    );
  }
  if (appConfig.endpoints?.agents?.remoteApi?.auth?.oidc?.enabled === true) {
    conflicts.push(
      'endpoints.agents.remoteApi.auth.oidc must be disabled: an OIDC bearer resolves a login account, not an organization member',
    );
  }
  return conflicts;
}

const RECONCILE_CONCURRENCY = 8;

/**
 * Makes every organization's ADMIN role hold exactly the configured capabilities, so a change
 * to `organizations.adminCapabilities` applies to existing organizations on the next start.
 * A failing organization is logged and skipped; the rest still reconcile.
 */
export async function reconcileOrganizationAdminGrants(deps: {
  listOrganizationTenantIds: () => Promise<string[]>;
  syncOrganizationAdminGrants: (
    tenantId: string,
    capabilities: readonly SystemCapability[],
  ) => Promise<{ granted: number; revoked: number }>;
  config?: { enabled: boolean; adminCapabilities: readonly TOrganizationAdminCapability[] };
}): Promise<{ organizations: number; failed: number }> {
  if (!deps.config?.enabled) {
    return { organizations: 0, failed: 0 };
  }
  const tenantIds = await deps.listOrganizationTenantIds();
  const capabilities = deps.config.adminCapabilities;
  let failed = 0;
  for (let index = 0; index < tenantIds.length; index += RECONCILE_CONCURRENCY) {
    const batch = tenantIds.slice(index, index + RECONCILE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((tenantId) => deps.syncOrganizationAdminGrants(tenantId, capabilities)),
    );
    results.forEach((result, offset) => {
      if (result.status === 'rejected') {
        failed += 1;
        logger.error(
          `[organizations] Could not reconcile admin capabilities for ${batch[offset]}`,
          result.reason,
        );
      }
    });
  }
  return { organizations: tenantIds.length, failed };
}

/** Refuses to start an organizations deployment whose settings would weaken isolation. */
export function assertOrganizationsRuntime(appConfig: RuntimeConfig, env: RuntimeEnv): void {
  const conflicts = findOrganizationsRuntimeConflicts(appConfig, env);
  if (conflicts.length === 0) {
    return;
  }
  throw new Error(
    `[organizations] Cannot start with organizations enabled:\n- ${conflicts.join('\n- ')}`,
  );
}
