const path = require('path');
const {
  logger,
  runAsSystem,
  createTempChatExpirationDate,
  forcedRetentionGapFilter,
  sweepForcedRetention,
} = require('@librechat/data-schemas');
const { RetentionMode } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const { getAppConfig } = require('~/server/services/Config');
const { Conversation, Message, SharedLink, File } = require('~/db/models');

/**
 * Backfills forced (ephemeral) retention over conversations that predate the mode.
 *
 * Convert-on-touch only converts chats that are subsequently written, so enabling ephemeral
 * retention on a deployment with existing data leaves untouched permanent chats visible and
 * non-expiring. This sweep converts every non-conforming conversation, its messages, its
 * shares, and its uploaded files to the forced window (capping rather than extending sooner
 * deadlines). It is idempotent and safe to re-run.
 */
async function migrateEphemeralRetention({ dryRun = true, force = false } = {}) {
  await connect();

  return runAsSystem(async () => {
    const appConfig = await getAppConfig();
    const interfaceConfig = appConfig?.interfaceConfig;
    const retentionMode = interfaceConfig?.retentionMode;

    logger.info('Starting Ephemeral Retention Migration', { dryRun, force, retentionMode });

    if (retentionMode !== RetentionMode.EPHEMERAL && !force) {
      logger.error(
        `retentionMode is "${retentionMode ?? 'unset'}", not "ephemeral". This migration ` +
          'converts every conversation into a temporary, expiring chat. Enable ephemeral ' +
          'retention first, or pass --force to run anyway.',
      );
      return { aborted: true, reason: 'retentionMode is not ephemeral', retentionMode };
    }

    const forcedExpiredAt = createTempChatExpirationDate(interfaceConfig);
    const nonConforming = await Conversation.countDocuments(
      forcedRetentionGapFilter(forcedExpiredAt),
    );
    logger.info(`Found ${nonConforming} non-conforming conversation(s)`, { forcedExpiredAt });

    if (dryRun) {
      return {
        dryRun: true,
        summary: { nonConformingConversations: nonConforming, forcedExpiredAt },
      };
    }

    const result = await sweepForcedRetention(
      Conversation,
      Message,
      SharedLink,
      File,
      forcedExpiredAt,
    );
    logger.info('Ephemeral Retention Migration completed', result);
    return { dryRun: false, forcedExpiredAt, ...result };
  });
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  migrateEphemeralRetention({ dryRun, force })
    .then((result) => {
      if (result.aborted) {
        console.log('\n=== MIGRATION ABORTED ===');
        console.log(`Reason: ${result.reason}`);
        console.log(`Current retentionMode: ${result.retentionMode ?? 'unset'}`);
        console.log('\nEnable ephemeral retention, or pass --force to run anyway.');
        process.exit(1);
      }

      if (result.dryRun) {
        console.log('\n=== DRY RUN RESULTS ===');
        console.log(`Non-conforming conversations: ${result.summary.nonConformingConversations}`);
        const expiry = result.summary.forcedExpiredAt;
        console.log(`Forced expiry: ${expiry?.toISOString?.() ?? expiry}`);
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
