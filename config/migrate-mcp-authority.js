const mongoose = require('mongoose');
const {
  assertMCPAuthorityReadiness,
  createMCPAuthorityProofCollections,
  createMCPAuthorityLookupIndexes,
  backfillMCPServerNormalizedNames,
} = require('@librechat/data-schemas');
const connect = require('./connect');

async function migrateMCPAuthority({ checkOnly = false } = {}) {
  await connect();
  if (!checkOnly) {
    await createMCPAuthorityProofCollections(mongoose.connection);
    await backfillMCPServerNormalizedNames(mongoose.connection);
    await createMCPAuthorityLookupIndexes(mongoose.connection);
  }
  return await assertMCPAuthorityReadiness(mongoose.connection);
}

if (require.main === module) {
  const checkOnly = process.argv.includes('--check') || process.argv.includes('--dry-run');
  migrateMCPAuthority({ checkOnly })
    .then(async (result) => {
      console.log(
        `MCP authority prerequisites are ready (${result.scannedServers} servers, ${result.indexes.length} indexes).`,
      );
      await mongoose.disconnect();
    })
    .catch(async (error) => {
      console.error(
        checkOnly ? 'MCP authority prerequisite check failed:' : 'MCP authority migration failed:',
        error,
      );
      await mongoose.disconnect();
      process.exitCode = 1;
    });
}

module.exports = { migrateMCPAuthority };
