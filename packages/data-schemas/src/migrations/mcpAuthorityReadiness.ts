import { normalizeServerName } from 'librechat-data-provider';
import type { IndexDescriptionInfo, IndexSpecification } from 'mongodb';
import type { Connection } from 'mongoose';
import { MCP_AUTHORITY_PROOF_COLLECTIONS } from '../methods/mcpAuthority';
import { MCP_AUTHORITY_LOOKUP_INDEXES } from './mcpAuthorityIndexes';

const READINESS_BATCH_SIZE = 500;
const PRIMARY_MAJORITY_OPTIONS = {
  readPreference: 'primary' as const,
  readConcern: { level: 'majority' as const },
};
const NORMALIZED_NAME_INDEX_KEYS: IndexSpecification = {
  normalizedServerName: 1,
  tenantId: 1,
};

export interface MCPAuthorityReadinessResult {
  scannedServers: number;
  collections: readonly string[];
  indexes: readonly string[];
}

export interface MCPAuthorityReadinessOptions {
  cosmosStrongConsistencyConfirmed?: boolean;
  mongoHost?: string;
}

export class MCPAuthorityReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPAuthorityReadinessError';
  }
}

function indexKeysMatch(
  actual: IndexDescriptionInfo['key'] | undefined,
  expected: IndexSpecification,
): boolean {
  if (!actual) {
    return false;
  }
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([key, value], index) =>
        key === expectedEntries[index][0] && value === expectedEntries[index][1],
    )
  );
}

async function findIndexes(
  connection: Connection,
  collectionName: string,
): Promise<IndexDescriptionInfo[]> {
  try {
    return await connection
      .db!.collection(collectionName)
      .listIndexes({
        readPreference: 'primary',
      })
      .toArray();
  } catch {
    throw new MCPAuthorityReadinessError(
      `MCP authority lookup index is missing for collection "${collectionName}"`,
    );
  }
}

async function assertLookupIndexes(connection: Connection): Promise<string[]> {
  const names: string[] = [];
  for (const definition of MCP_AUTHORITY_LOOKUP_INDEXES) {
    const indexes = await findIndexes(connection, definition.collection);
    const match = indexes.find((index) => indexKeysMatch(index.key, definition.keys));
    if (!match) {
      throw new MCPAuthorityReadinessError(
        `MCP authority lookup index is missing for collection "${definition.collection}"`,
      );
    }
    names.push(match.name ?? definition.name);
  }
  return names;
}

async function assertProofCollections(connection: Connection): Promise<string[]> {
  const collections = await connection
    .db!.listCollections(
      { name: { $in: [...MCP_AUTHORITY_PROOF_COLLECTIONS] } },
      { nameOnly: true, authorizedCollections: true },
    )
    .toArray();
  const existing = new Set(collections.map(({ name }) => name));
  const missing = MCP_AUTHORITY_PROOF_COLLECTIONS.find((name) => !existing.has(name));
  if (missing) {
    throw new MCPAuthorityReadinessError(`MCP authority proof collection is missing: "${missing}"`);
  }
  return [...MCP_AUTHORITY_PROOF_COLLECTIONS];
}

async function assertNormalizedServerNames(connection: Connection): Promise<{
  scannedServers: number;
  indexName: string;
}> {
  const collection = connection.db!.collection<{
    serverName?: string;
    normalizedServerName?: string;
    tenantId?: string;
  }>('mcpservers');
  const collision = await collection
    .aggregate<{ _id: { tenantId: string | null; normalizedServerName: string } }>(
      [
        { $match: { normalizedServerName: { $type: 'string' } } },
        {
          $group: {
            _id: {
              tenantId: { $ifNull: ['$tenantId', null] },
              normalizedServerName: '$normalizedServerName',
            },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ],
      PRIMARY_MAJORITY_OPTIONS,
    )
    .next();
  if (collision) {
    throw new MCPAuthorityReadinessError(
      'MCP server names contain a normalized identity collision',
    );
  }

  let scannedServers = 0;
  const cursor = collection.find(
    {},
    {
      ...PRIMARY_MAJORITY_OPTIONS,
      projection: { _id: 0, serverName: 1, normalizedServerName: 1, tenantId: 1 },
      batchSize: READINESS_BATCH_SIZE,
    },
  );
  for await (const server of cursor) {
    scannedServers++;
    if (
      typeof server.serverName !== 'string' ||
      !server.serverName.trim() ||
      (server.tenantId !== undefined && typeof server.tenantId !== 'string') ||
      typeof server.normalizedServerName !== 'string' ||
      server.normalizedServerName !== normalizeServerName(server.serverName)
    ) {
      throw new MCPAuthorityReadinessError('MCP server normalized names are missing or stale');
    }
  }

  const indexes = await findIndexes(connection, 'mcpservers');
  const normalizedIndex = indexes.find(
    (index) =>
      indexKeysMatch(index.key, NORMALIZED_NAME_INDEX_KEYS) &&
      index.unique === true &&
      index.partialFilterExpression?.normalizedServerName?.$exists === true,
  );
  if (!normalizedIndex) {
    throw new MCPAuthorityReadinessError(
      'The unique MCP normalized-server-name index is missing or malformed',
    );
  }
  return {
    scannedServers,
    indexName: normalizedIndex.name ?? 'normalizedServerName_1_tenantId_1',
  };
}

/** Verifies the read-only rollout prerequisites required before MCP authority proofs are used. */
export async function assertMCPAuthorityReadiness(
  connection: Connection,
  options: MCPAuthorityReadinessOptions = {},
): Promise<MCPAuthorityReadinessResult> {
  const mongoHost = options.mongoHost ?? connection.host;
  if (
    /\.mongo\.cosmos\.azure\.com$/i.test(mongoHost) &&
    options.cosmosStrongConsistencyConfirmed !== true
  ) {
    throw new MCPAuthorityReadinessError(
      'Azure Cosmos DB MCP authority requires account-level Strong consistency and ' +
        'MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED=true',
    );
  }
  const collections = await assertProofCollections(connection);
  const normalizedNames = await assertNormalizedServerNames(connection);
  const lookupIndexes = await assertLookupIndexes(connection);
  return {
    scannedServers: normalizedNames.scannedServers,
    collections,
    indexes: [normalizedNames.indexName, ...lookupIndexes],
  };
}
