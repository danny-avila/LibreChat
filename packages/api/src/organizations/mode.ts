import { organizationsConfigSchema } from 'librechat-data-provider';
import type { TOrganizationsConfig, TStartupOrganizationsConfig } from 'librechat-data-provider';

/**
 * Whether the deployment runs in organizations mode is decided once per process, from the
 * base config: `organizations` is a base-only section, so no tenant override can flip it.
 * It is held here rather than threaded through every caller because passport strategies and
 * the database method factories are built before any request (or loaded config) exists; they
 * read it lazily through these getters.
 */
let organizationsConfig: TOrganizationsConfig = organizationsConfigSchema.parse(undefined);

/** Applies the base config's `organizations` section. Called once at startup. */
export function configureOrganizations(config: Partial<TOrganizationsConfig> | undefined): void {
  organizationsConfig = organizationsConfigSchema.parse(config ?? {});
}

export function getOrganizationsConfig(): TOrganizationsConfig {
  return organizationsConfig;
}

export function isOrganizationsEnabled(): boolean {
  return organizationsConfig.enabled;
}

/** The slice of the settings the client needs; absent when organizations are disabled. */
export function getPublicOrganizationsConfig(): TStartupOrganizationsConfig | undefined {
  if (!organizationsConfig.enabled) {
    return undefined;
  }
  return {
    enabled: true,
    allowCreate: organizationsConfig.allowCreate,
    allowLinkInvites: organizationsConfig.invites.allowLinkInvites,
    maxPerAccount: organizationsConfig.maxPerAccount,
  };
}
