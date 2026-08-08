import { normalizeServerName } from 'librechat-data-provider';
import type { Connection, Types } from 'mongoose';

interface MCPServerNameRow {
  _id: Types.ObjectId;
  serverName?: string;
  normalizedServerName?: string;
  tenantId?: string;
}

const AUTHORITATIVE_FIND_OPTIONS = {
  projection: { _id: 1, serverName: 1, normalizedServerName: 1, tenantId: 1 },
  readPreference: 'primary' as const,
  readConcern: { level: 'majority' as const },
};
const NORMALIZED_NAME_INDEX = 'normalizedServerName_1_tenantId_1';

export interface MCPServerNameMigrationResult {
  scanned: number;
  updated: number;
}

export class MCPServerNameMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPServerNameMigrationError';
  }
}

function normalizedIdentity(server: MCPServerNameRow): {
  serverName: string;
  normalizedServerName: string;
} {
  if (typeof server.serverName !== 'string' || !server.serverName.trim()) {
    throw new MCPServerNameMigrationError('MCP server name index contains a malformed name');
  }
  if (server.tenantId !== undefined && typeof server.tenantId !== 'string') {
    throw new MCPServerNameMigrationError('MCP server name index contains a malformed tenant');
  }
  const normalizedServerName = normalizeServerName(server.serverName);
  if (!normalizedServerName) {
    throw new MCPServerNameMigrationError('MCP server name index contains an empty identity');
  }
  return { serverName: server.serverName, normalizedServerName };
}

/** Backfills the compact normalized-name index required before authority proofs are enabled. */
export async function backfillMCPServerNormalizedNames(
  connection: Connection,
): Promise<MCPServerNameMigrationResult> {
  const collection = connection.db!.collection<MCPServerNameRow>('mcpservers');
  const identities = new Map<string, { id: string; serverName: string }>();
  const updates: Array<{ id: Types.ObjectId; normalizedServerName: string }> = [];
  let scanned = 0;
  let updated = 0;

  for await (const server of collection.find({}, AUTHORITATIVE_FIND_OPTIONS)) {
    scanned++;
    const { serverName, normalizedServerName } = normalizedIdentity(server);
    const identity = JSON.stringify([server.tenantId ?? null, normalizedServerName]);
    const existing = identities.get(identity);
    if (existing && existing.id !== server._id.toHexString()) {
      throw new MCPServerNameMigrationError(
        `MCP server names normalize to the same identity in one tenant: "${existing.serverName}" and "${serverName}"`,
      );
    }
    identities.set(identity, { id: server._id.toHexString(), serverName });
    if (server.normalizedServerName !== normalizedServerName) {
      updated++;
      updates.push({ id: server._id, normalizedServerName });
    }
  }

  for (const update of updates) {
    await collection.updateOne(
      { _id: update.id },
      { $set: { normalizedServerName: update.normalizedServerName } },
    );
  }
  const legacyIndex = (await collection.listIndexes().toArray()).find(
    (index) =>
      index.name === NORMALIZED_NAME_INDEX &&
      (index.partialFilterExpression !== undefined || index.unique === true),
  );
  if (legacyIndex) {
    await collection.dropIndex(NORMALIZED_NAME_INDEX);
  }
  await collection.createIndex(
    { normalizedServerName: 1, tenantId: 1 },
    {
      name: NORMALIZED_NAME_INDEX,
    },
  );
  return { scanned, updated };
}
