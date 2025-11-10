import { LCAvailableTools } from '~/mcp/types';
import { IMCPToolsCache, CachedTools } from './IMCPToolsCache';

export class MCPToolsCacheInMemory implements IMCPToolsCache {
  private cache: Map<string, CachedTools> = new Map();

  async add(serverName: string, tools: LCAvailableTools): Promise<void> {
    this.cache.set(serverName, {
      tools,
      cachedAt: Date.now(),
    });
  }

  async update(serverName: string, tools: LCAvailableTools): Promise<void> {
    if (!this.cache.has(serverName)) {
      throw new Error(`Server ${serverName} does not exist in cache.`);
    }
    this.cache.set(serverName, {
      tools,
      cachedAt: Date.now(),
    });
  }

  async remove(serverName: string): Promise<void> {
    this.cache.delete(serverName);
  }

  async get(serverName: string): Promise<CachedTools | undefined> {
    return this.cache.get(serverName);
  }

  async getAll(): Promise<Record<string, CachedTools>> {
    return Object.fromEntries(this.cache);
  }

  async reset(): Promise<void> {
    this.cache.clear();
  }
}
