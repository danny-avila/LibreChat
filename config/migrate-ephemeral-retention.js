const path = require('path');
const {
  logger,
  runAsSystem,
  tenantStorage,
  createTempChatExpirationDate,
  forcedRetentionGapFilter,
  sweepForcedRetention,
  BASE_CONFIG_PRINCIPAL_ID,
} = require('@librechat/data-schemas');
const { RetentionMode } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { getAppConfig } = require('~/server/services/Config');
const { Conversation, Message, SharedLink, File, Config } = require('~/db/models');
const { refreshChatProjectStats } = require('~/models');

const RETENTION_OVERRIDE_PATHS = ['interface.retentionMode', 'interface.temporaryChatRetention'];

const overridesTouchRetention = (overrides) => {
  const interfaceOverrides = overrides?.interface;
  if (interfaceOverrides == null || typeof interfaceOverrides !== 'object') {
    return false;
  }
  return 'retentionMode' in interfaceOverrides || 'temporaryChatRetention' in interfaceOverrides;
};

const tombstonesTouchRetention = (tombstones) =>
  (tombstones ?? []).some(
    (tombstone) => tombstone === 'interface' || RETENTION_OVERRIDE_PATHS.includes(tombstone),
  );

/**
 * Finds active principal-scoped (role/user/group) config overrides that change retention
 * behavior. The sweep evaluates one config per tenant, so a principal whose effective
 * retention differs from the tenant default would be skipped or swept with the wrong
 * deadline; such tenants are refused instead of migrated incorrectly.
 */
async function findPrincipalRetentionOverrides() {
  const configs = await Config.find({
    isActive: true,
    principalId: { $ne: BASE_CONFIG_PRINCIPAL_ID },
  })
    .select('principalType principalId overrides tombstones')
    .lean();

  return configs
    .filter(
      (config) =>
        overridesTouchRetention(config.overrides) || tombstonesTouchRetention(config.tombstones),
    )
    .map((config) => `${config.principalType}:${config.principalId}`);
}

/**
 * Converts one tenant's pre-existing data to the forced (ephemeral) window using that tenant's
 * own retention config. Runs inside the caller's tenant context, so every query is scoped to the
 * tenant (the untenanted bucket runs in the system context and touches the untenanted rows). A
 * tenant whose resolved config is not ephemeral is skipped unless `force` is set.
 */
async function sweepTenant({ tenantId, dryRun, force }) {
  const label = tenantId ?? 'default';
  const appConfig = await getAppConfig(tenantId ? { tenantId } : undefined);
  const interfaceConfig = appConfig?.interfaceConfig;
  const retentionMode = interfaceConfig?.retentionMode;

  if (retentionMode !== RetentionMode.EPHEMERAL && !force) {
    logger.info(
      `[tenant ${label}] retentionMode is "${retentionMode ?? 'unset'}", not "ephemeral" — skipping.`,
    );
    return { tenantId: tenantId ?? null, skipped: true, retentionMode };
  }

  const principalOverrides = await findPrincipalRetentionOverrides();
  if (principalOverrides.length > 0 && !force) {
    logger.error(
      `[tenant ${label}] ${principalOverrides.length} principal-scoped config override(s) change ` +
        `retention behavior (${principalOverrides.join(', ')}). The migration evaluates one ` +
        'config per tenant, so it cannot safely convert this tenant; remove the overrides or ' +
        'pass --force to sweep with the tenant-level config anyway.',
    );
    return {
      tenantId: tenantId ?? null,
      skipped: true,
      retentionMode,
      reason: 'principal-scoped retention overrides',
      principalOverrides,
    };
  }

  const forcedExpiredAt = createTempChatExpirationDate(interfaceConfig);
  const nonConforming = await Conversation.countDocuments(
    forcedRetentionGapFilter(forcedExpiredAt),
  );
  logger.info(`[tenant ${label}] Found ${nonConforming} non-conforming conversation(s)`, {
    forcedExpiredAt,
  });

  if (dryRun) {
    return { tenantId: tenantId ?? null, dryRun: true, nonConforming, forcedExpiredAt };
  }

  const { projects, ...counts } = await sweepForcedRetention(
    Conversation,
    Message,
    SharedLink,
    File,
    forcedExpiredAt,
  );

  /**
   * Converted conversations are hidden from project views (isTemporary: true), so recompute the
   * cached stats of every project that owned one; otherwise conversationCount and
   * lastConversationId keep pointing at chats the project workspace no longer shows.
   */
  let projectsRefreshed = 0;
  for (const { user, chatProjectId } of projects) {
    try {
      await refreshChatProjectStats(user, chatProjectId);
      projectsRefreshed += 1;
    } catch (error) {
      logger.error(`[tenant ${label}] Failed to refresh project ${chatProjectId} stats`, error);
    }
  }

  const result = { ...counts, projectsRefreshed };
  logger.info(`[tenant ${label}] completed`, result);
  return { tenantId: tenantId ?? null, forcedExpiredAt, ...result };
}

/**
 * Backfills forced (ephemeral) retention over conversations that predate the mode.
 *
 * Convert-on-touch only converts chats that are subsequently written, so enabling ephemeral
 * retention on a deployment with existing data leaves untouched permanent chats visible and
 * non-expiring. This sweep converts every non-conforming conversation, its messages, its
 * shares, and its uploaded files to the forced window (capping rather than extending sooner
 * deadlines). It is idempotent and safe to re-run.
 *
 * Each tenant is converted with its OWN retention config: tenants are enumerated and swept inside
 * their tenant context (so queries are scoped to that tenant), and a tenant whose config is not
 * ephemeral is skipped. This prevents a system/default config from force-expiring a tenant that
 * never enabled ephemeral retention. In a mixed deployment, rows without a tenantId cannot be
 * scoped to a tenant config, so they are left untouched and must be converted from a
 * single-tenant context.
 */
async function migrateEphemeralRetention({ dryRun = true, force = false } = {}) {
  await connect();

  return runAsSystem(async () => {
    logger.info('Starting Ephemeral Retention Migration', { dryRun, force });

    const tenantIds = await Conversation.distinct('tenantId');
    const realTenants = tenantIds.filter((tenantId) => tenantId != null && tenantId !== '');
    /**
     * `distinct` only enumerates stored values, so rows missing the tenantId field entirely
     * contribute nothing to it. Count them directly ({ tenantId: null } matches both explicit
     * null and missing fields) so pre-tenancy rows in a mixed deployment surface a warning
     * instead of being silently skipped.
     */
    const untenantedCount = await Conversation.countDocuments({
      $or: [{ tenantId: null }, { tenantId: '' }],
    });
    const hasUntenanted = untenantedCount > 0;
    const skippedUntenanted = realTenants.length > 0 && hasUntenanted;

    const tenants = realTenants.length > 0 ? realTenants : [undefined];
    if (skippedUntenanted) {
      logger.warn(
        `${untenantedCount} conversation(s) have no tenantId; they cannot be scoped to a tenant ` +
          'config and are skipped. Re-run in a single-tenant context to convert them.',
      );
    }

    const results = [];
    for (const tenantId of tenants) {
      const result = tenantId
        ? await tenantStorage.run({ tenantId }, async () =>
            sweepTenant({ tenantId, dryRun, force }),
          )
        : await sweepTenant({ tenantId, dryRun, force });
      results.push(result);
    }

    return { dryRun, skippedUntenanted, tenants: results };
  });
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  migrateEphemeralRetention({ dryRun, force })
    .then((result) => {
      if (result.skippedUntenanted) {
        console.log('\nNote: conversations without a tenantId were skipped (see log warning).');
      }

      if (result.tenants.length > 0 && result.tenants.every((tenant) => tenant.skipped)) {
        console.log('\n=== NOTHING TO MIGRATE ===');
        for (const tenant of result.tenants) {
          const label = tenant.tenantId ?? 'default';
          const reason = tenant.reason ?? `retentionMode: ${tenant.retentionMode ?? 'unset'}`;
          console.log(`[${label}] skipped (${reason})`);
        }
        console.log('Enable ephemeral retention, or pass --force to run anyway.');
        process.exit(1);
      }

      if (result.dryRun) {
        console.log('\n=== DRY RUN RESULTS ===');
        for (const tenant of result.tenants) {
          const label = tenant.tenantId ?? 'default';
          if (tenant.skipped) {
            const reason = tenant.reason ?? `retentionMode: ${tenant.retentionMode ?? 'unset'}`;
            console.log(`[${label}] skipped (${reason})`);
            continue;
          }
          const expiry = tenant.forcedExpiredAt;
          console.log(
            `[${label}] non-conforming conversations: ${tenant.nonConforming} ` +
              `(forced expiry: ${expiry?.toISOString?.() ?? expiry})`,
          );
        }
        console.log('\nTo run the actual migration, remove the --dry-run flag.');
      } else {
        console.log('\n=== MIGRATION RESULTS ===');
        console.log(JSON.stringify(result, null, 2));
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ephemeral retention migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateEphemeralRetention };
