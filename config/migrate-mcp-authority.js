const mongoose = require('mongoose');
const {
  assertMCPAuthorityReadiness,
  createMCPAuthorityProofCollections,
  createMCPAuthorityLookupIndexes,
  backfillMCPServerNormalizedNames,
  getMCPAuthorityConsistencyModule,
} = require('@librechat/data-schemas');
const connect = require('./connect');

async function migrateMCPAuthority({ checkOnly = false, reconciliation } = {}) {
  await connect();
  if (!checkOnly) {
    await createMCPAuthorityProofCollections(mongoose.connection);
    await backfillMCPServerNormalizedNames(mongoose.connection);
    await createMCPAuthorityLookupIndexes(mongoose.connection);
  }
  const readiness = await assertMCPAuthorityReadiness(mongoose.connection);
  const consistency = getMCPAuthorityConsistencyModule(mongoose);
  const status = await consistency.getMCPAuthorityConsistencyStatus();
  if (!status.dirty) {
    if (reconciliation) {
      throw new Error('MCP authority consistency fence is already clean');
    }
    return { ...readiness, consistencyGeneration: status.generation };
  }
  if (!reconciliation) {
    throw new Error(
      `MCP authority consistency fence is dirty at generation ${status.generation} for owner ${status.ownerId}. ` +
        'Verify that writer is permanently stopped, then rerun with --reconcile-dirty ' +
        `--owner ${status.ownerId} --generation ${status.generation} --confirm-writer-stopped.`,
    );
  }
  const reconciled = await consistency.reconcileMCPAuthorityConsistency(reconciliation);
  return { ...readiness, consistencyGeneration: reconciled.generation };
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (require.main === module) {
  const checkOnly = process.argv.includes('--check') || process.argv.includes('--dry-run');
  const reconcileDirty = process.argv.includes('--reconcile-dirty');
  const confirmed = process.argv.includes('--confirm-writer-stopped');
  const owner = readArgument('--owner');
  const rawGeneration = readArgument('--generation');
  if (reconcileDirty && (!confirmed || !owner || rawGeneration === undefined)) {
    console.error(
      'Dirty-fence recovery requires --owner, --generation, and --confirm-writer-stopped.',
    );
    process.exitCode = 1;
  } else {
    const reconciliation = reconcileDirty
      ? { expectedOwnerId: owner, expectedGeneration: Number(rawGeneration) }
      : undefined;
    migrateMCPAuthority({ checkOnly, reconciliation })
      .then(async (result) => {
        console.log(
          `MCP authority prerequisites are ready at generation ${result.consistencyGeneration} ` +
            `(${result.scannedServers} servers, ${result.indexes.length} indexes).`,
        );
        await mongoose.disconnect();
      })
      .catch(async (error) => {
        console.error(
          checkOnly
            ? 'MCP authority prerequisite check failed:'
            : 'MCP authority migration failed:',
          error,
        );
        await mongoose.disconnect();
        process.exitCode = 1;
      });
  }
}

module.exports = { migrateMCPAuthority };
