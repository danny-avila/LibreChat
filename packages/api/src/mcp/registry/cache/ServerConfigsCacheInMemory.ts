import { ParsedServerConfig } from '~/mcp/types';

/**
 * In-memory implementation of MCP server configurations cache for single-instance deployments.
 * Uses a native JavaScript Map for fast, local storage without Redis dependencies.
 * Suitable for development environments or single-server production deployments.
 * Does not require leader checks or distributed coordination since data is instance-local.
 * Data is lost on server restart and not shared across multiple server instances.
 */
export class ServerConfigsCacheInMemory {
  private readonly cache: Map<string, ParsedServerConfig> = new Map();

  public async add(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (this.cache.has(serverName))
      throw new Error(
        `Server "${serverName}" already exists in cache. Use update() to modify existing configs.`,
      );
    this.cache.set(serverName, config);
  }

  public async update(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (!this.cache.has(serverName))
      throw new Error(
        `Server "${serverName}" does not exist in cache. Use add() to create new configs.`,
      );
    this.cache.set(serverName, config);
  }

  public async remove(serverName: string): Promise<void> {
    if (!this.cache.delete(serverName)) {
      throw new Error(`Failed to remove server "${serverName}" in cache.`);
    }
  }

  public async get(serverName: string): Promise<ParsedServerConfig | undefined> {
    return this.cache.get(serverName);
  }

  public async getAll(): Promise<Record<string, ParsedServerConfig>> {
    return Object.fromEntries(this.cache);
  }

  public async reset(): Promise<void> {
    this.cache.clear();
  }
}
