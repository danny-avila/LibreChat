import type { Connection } from 'mongoose';
import { MCP_AUTHORITY_PROOF_COLLECTIONS } from '../methods/mcpAuthority';

const NAMESPACE_EXISTS_CODE = 48;

function isNamespaceExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: number }).code === NAMESPACE_EXISTS_CODE
  );
}

/** Creates every collection read by an MCP authority snapshot before proofs are enabled. */
export async function createMCPAuthorityProofCollections(
  connection: Connection,
): Promise<readonly string[]> {
  const created: string[] = [];
  for (const collectionName of MCP_AUTHORITY_PROOF_COLLECTIONS) {
    try {
      await connection.db!.createCollection(collectionName);
    } catch (error) {
      if (!isNamespaceExists(error)) {
        throw error;
      }
    }
    created.push(collectionName);
  }
  return created;
}
