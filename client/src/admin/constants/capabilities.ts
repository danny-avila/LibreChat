import { CAPABILITY_CATEGORIES as UPSTREAM_CAPABILITY_CATEGORIES } from 'librechat-data-provider';

export {
  SystemCapabilities,
  expandImplications,
  hasImpliedCapability,
  CapabilityImplications,
} from 'librechat-data-provider';

/**
 * Forward-compat shim: the LibreChat backend gates `/api/admin/audit-log` on
 * this capability string, and the LC sibling PR adds it to
 * `SystemCapabilities` in `@librechat/data-schemas@0.0.53`. Until that version
 * is published to npm and the pin here is bumped, referencing
 * `SystemCapabilities.READ_AUDIT_LOG` directly breaks `tsc` against the
 * currently-pinned `^0.0.52`. The value is byte-identical to what the upstream
 * constant will resolve to post-publish; drop this constant in a one-line
 * follow-up once the data-schemas pin moves to `^0.0.53`.
 */
export const READ_AUDIT_LOG_CAPABILITY = 'read:audit_log' as const;

/**
 * Local override of the upstream `CAPABILITY_CATEGORIES` so the System
 * category surfaces `READ_AUDIT_LOG` in the grants editing UI even while the
 * dep is pinned to `data-schemas@0.0.52` (which predates the category entry).
 * Without this, only seeded admins could ever hold the capability — the
 * grants `CapabilityPanel` had no row to toggle.
 *
 * Drops to a no-op once `0.0.53+` is pinned because the upstream array already
 * contains `READ_AUDIT_LOG`; the dedupe pass below keeps it safe to keep
 * shipped until the shim itself is removed.
 */
export const CAPABILITY_CATEGORIES: typeof UPSTREAM_CAPABILITY_CATEGORIES =
  UPSTREAM_CAPABILITY_CATEGORIES.map((cat) => {
    if (cat.key !== 'system') return cat;
    const caps = cat.capabilities as readonly string[];
    if (caps.includes(READ_AUDIT_LOG_CAPABILITY)) return cat;
    return {
      ...cat,
      capabilities: [...cat.capabilities, READ_AUDIT_LOG_CAPABILITY],
    } as typeof cat;
  });
