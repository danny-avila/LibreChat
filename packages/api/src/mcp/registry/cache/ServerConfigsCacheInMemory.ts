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
    this.cache.set(serverName, { ...config, lastUpdatedAt: Date.now() });
  }

  public async update(serverName: string, config: ParsedServerConfig): Promise<void> {
    if (!this.cache.has(serverName))
      throw new Error(
        `Server "${serverName}" does not exist in cache. Use add() to create new configs.`,
      );
    this.cache.set(serverName, { ...config, lastUpdatedAt: Date.now() });
  }

  /**
   * Sets a server config without checking if it exists (upsert operation).
   * Use this for bulk operations where you want to add or update without error handling.
   */
  public async set(serverName: string, config: ParsedServerConfig): Promise<void> {
    this.cache.set(serverName, { ...config, lastUpdatedAt: Date.now() });
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

  /**
   * Returns a placeholder namespace for consistency with Redis implementation.
   * In-memory cache doesn't use namespaces, so this always returns empty string.
   */
  public getNamespace(): string {
    return '';
  }
}
