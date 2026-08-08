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
  const consistency = getMCPAuthorityConsistencyModule(mongoose);
  const readinessOptions = {
    cosmosStrongConsistencyConfirmed:
      process.env.MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED === 'true',
  };
  let status = checkOnly
    ? await consistency.inspectMCPAuthorityConsistencyStatus()
    : await consistency.getMCPAuthorityConsistencyStatus();
  if (status == null) {
    throw new Error('MCP authority consistency fence is not initialized');
  }
  if (status.dirty) {
    if (!reconciliation || checkOnly) {
      throw new Error(
        `MCP authority consistency fence is dirty at generation ${status.generation} for owner ${status.ownerId}. ` +
          'Verify that writer is permanently stopped, then rerun with --reconcile-dirty ' +
          `--owner ${status.ownerId} --generation ${status.generation} --confirm-writer-stopped.`,
      );
    }
    await consistency.reconcileMCPAuthorityConsistency(reconciliation);
  } else {
    if (reconciliation) {
      throw new Error('MCP authority consistency fence is already clean');
    }
  }

  if (!checkOnly) {
    await createMCPAuthorityProofCollections(mongoose.connection);
    await consistency.mutateMCPAuthority(() =>
      backfillMCPServerNormalizedNames(mongoose.connection),
    );
    await createMCPAuthorityLookupIndexes(mongoose.connection);
    status = await consistency.getMCPAuthorityConsistencyStatus();
  }
  const readiness = await assertMCPAuthorityReadiness(mongoose.connection, readinessOptions);
  return { ...readiness, consistencyGeneration: status.generation };
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
