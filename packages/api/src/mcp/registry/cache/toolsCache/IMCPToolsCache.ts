import { LCAvailableTools } from '~/mcp/types';

/**
 * Cached tools entry with timestamp for staleness detection
 */
export interface CachedTools {
  tools: LCAvailableTools;
  cachedAt: number;
}

export interface IMCPToolsCache {
  add: (serverName: string, tools: LCAvailableTools) => Promise<void>;
  update: (serverName: string, tools: LCAvailableTools) => Promise<void>;
  remove: (serverName: string) => Promise<void>;
  get: (serverName: string) => Promise<CachedTools | undefined>;
  getAll: () => Promise<Record<string, CachedTools>>;
  reset: () => Promise<void>;
}
