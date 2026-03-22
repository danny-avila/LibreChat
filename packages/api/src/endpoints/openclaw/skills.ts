import { logger } from '@librechat/data-schemas';
import type { OpenClawSkillEntry } from './types';
import { gatewayManager } from './gateway';

/** Fetch available skills from the gateway. */
export async function getSkills(
  gatewayUrl: string,
  apiKey: string,
): Promise<OpenClawSkillEntry[]> {
  try {
    const client = await gatewayManager.getClient(gatewayUrl, apiKey);
    return await client.skillsBins();
  } catch (err) {
    logger.warn('[OpenClaw/skills] Failed to fetch skills', err);
    return [];
  }
}
