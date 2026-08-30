import { ParsedServerConfig, AddServerResult } from '~/mcp/types';

/**
 * Contract for MCP server configuration storage, whether cache-backed or DB-backed.
 */
export interface IServerConfigsRepositoryInterface {
  add(serverName: string, config: ParsedServerConfig, userId?: string): Promise<AddServerResult>;

  //ACL Entry check if update is possible
  update(serverName: string, config: ParsedServerConfig, userId?: string): Promise<void>;

  /** Atomic add-or-update without requiring callers to inspect error messages. */
  upsert(serverName: string, config: ParsedServerConfig, userId?: string): Promise<void>;

  /**
   * Merges inspector-derived fields into an existing entry WITHOUT bumping
   * `updatedAt`: the config identity is unchanged, and a bump would mark every
   * live connection for the server stale. Returns false when the server is
   * unknown. Optional: DB-backed storage does not implement it yet — an
   * identity-preserving write there has to thread mongoose timestamps and the
   * credential-sanitization pipeline, which is its own change. When the patch
   * includes `resolvedInstructions`, a previously stored value wins so a
   * concurrent first connection cannot replace shared instructions.
   */
  patch?(
    serverName: string,
    fields: Partial<ParsedServerConfig>,
    expectedUpdatedAt?: number,
  ): Promise<boolean>;

  //ACL Entry check if remove is possible
  remove(serverName: string, userId?: string): Promise<void>;

  //ACL Entry check if read is possible
  get(serverName: string, userId?: string): Promise<ParsedServerConfig | undefined>;

  //ACL Entry get all accessible mcp config definitions + any mcp configured with agents
  getAll(userId?: string, role?: string): Promise<Record<string, ParsedServerConfig>>;

  reset(): Promise<void>;
}
