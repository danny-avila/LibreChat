import { loadDjangoSpec, filterSpecForApp } from './specLoader';
import { buildJuristaiTools } from './toolBuilder';
import type { JuristaiSpecConfig } from './specLoader';
import type { JuristaiToolDefinition } from './toolBuilder';

export { mintChatJwt, clearChatJwtCache } from './jwtMinter';
export {
  DEFAULT_JURISTAI_APP_ID,
  JURISTAI_PER_APP_OPERATIONS,
  JURISTAI_PROMPT_APP_MAP,
  JURISTAI_APP_CONTEXT_OPERATION_IDS,
  normalizeJuristaiAppId,
  mapJuristaiPromptToAppId,
  resolveJuristaiAppId,
  isJuristaiAppContextOperation,
} from './policy';
export { loadDjangoSpec, filterSpecForApp, clearSpecCache } from './specLoader';
export { buildJuristaiTools, JURISTAI_TOOL_PREFIX } from './toolBuilder';

export type { ChatTokenUser } from './jwtMinter';
export type { JuristaiSpecConfig } from './specLoader';
export type { JuristaiToolDefinition } from './toolBuilder';

/**
 * Resolves the curated set of django-hub tools for an app: fetch (or reuse the
 * cached) spec, filter to the llm-callable subset allowed for the appId, and
 * build namespaced tool definitions ready to advertise to the model.
 */
export async function loadJuristaiToolCatalog(
  config: JuristaiSpecConfig,
  appId?: string,
  forceRefresh = false,
): Promise<JuristaiToolDefinition[]> {
  const spec = await loadDjangoSpec(config, forceRefresh);
  const filtered = filterSpecForApp(spec, config, appId);
  return buildJuristaiTools(filtered, config.djangoBaseUrl);
}
