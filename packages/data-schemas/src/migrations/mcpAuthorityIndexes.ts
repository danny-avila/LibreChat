import type { IndexSpecification } from 'mongodb';
import type { Connection } from 'mongoose';

interface AuthorityIndexDefinition {
  collection: string;
  keys: IndexSpecification;
  name: string;
}

const AUTHORITY_INDEXES: readonly AuthorityIndexDefinition[] = [
  {
    collection: 'groups',
    keys: { memberIds: 1, tenantId: 1 },
    name: 'memberIds_1_tenantId_1',
  },
  {
    collection: 'agents',
    keys: { mcpServerNames: 1, tenantId: 1 },
    name: 'mcpServerNames_1_tenantId_1',
  },
  {
    collection: 'pluginauths',
    keys: { userId: 1, pluginKey: 1, authField: 1, tenantId: 1 },
    name: 'userId_1_pluginKey_1_authField_1_tenantId_1',
  },
  {
    collection: 'tokens',
    keys: { userId: 1, type: 1, identifier: 1, tenantId: 1 },
    name: 'userId_1_type_1_identifier_1_tenantId_1',
  },
];

/** Creates the bounded lookup indexes required before MCP authority proofs are enabled. */
export async function createMCPAuthorityLookupIndexes(
  connection: Connection,
): Promise<readonly string[]> {
  const created: string[] = [];
  for (const definition of AUTHORITY_INDEXES) {
    const name = await connection
      .db!.collection(definition.collection)
      .createIndex(definition.keys, { name: definition.name });
    created.push(name);
  }
  return created;
}
