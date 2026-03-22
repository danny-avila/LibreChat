import { logger } from '@librechat/data-schemas';
import type { OpenClawToolCatalogEntry } from './types';
import { gatewayManager } from './gateway';

interface ToolsCache {
  entries: OpenClawToolCatalogEntry[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
const caches = new Map<string, ToolsCache>();

/** Fetch the tool catalog from the gateway with a 5-minute in-memory cache. */
export async function getToolCatalog(
  gatewayUrl: string,
  apiKey: string,
): Promise<OpenClawToolCatalogEntry[]> {
  const key = `${gatewayUrl}::${apiKey}`;
  const cached = caches.get(key);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.entries;
  }

  try {
    const client = await gatewayManager.getClient(gatewayUrl, apiKey);
    const entries = await client.toolsCatalog();
    caches.set(key, { entries, fetchedAt: Date.now() });
    return entries;
  } catch (err) {
    logger.warn('[OpenClaw/tools] Failed to fetch tool catalog', err);
    return cached?.entries ?? [];
  }
}
