const { logger } = require('@librechat/data-schemas');
const { AuthTypeEnum, AuthorizationTypeEnum } = require('librechat-data-provider');
const { loadJuristaiToolCatalog, mintChatJwt, JURISTAI_TOOL_PREFIX } = require('@librechat/api');
const { createActionTool } = require('~/server/services/ActionService');

/**
 * Glue between the django-hub tool catalog (packages/api) and the LibreChat
 * agent loop. Advertises curated Django endpoints as native tools and executes
 * them via createActionTool with a per-request, per-user minted JWT.
 *
 * The whole integration is gated behind JURISTAI_DJANGO_TOOLS_ENABLED so it is
 * a no-op (zero behavior change) unless explicitly turned on.
 *
 * Spike scope: a single bundled `search-case` spec, so we don't depend on
 * django-hub's admin-gated /api/schema endpoint yet. Swap `staticSpec` for a
 * live fetch (specLoader supports schemaAuthToken) once schema access is sorted.
 */

const DEFAULT_DJANGO_BASE_URL = 'https://api-dev.juristai.org';

/** prompt_id -> appId (FedCrim = 1, LitigAI = 2), used for per-app curation. */
const PROMPT_APP_MAP = {
  pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796: '1',
  pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916: '2',
};

/** Bundled OpenAPI slice for the spike. Mirrors CaseSearchSerializer. */
const SEARCH_CASE_SPEC = {
  openapi: '3.0.0',
  info: { title: 'Jurist Hub API (bundled)', version: '1.0.0' },
  paths: {
    '/api/core/search-case/': {
      post: {
        operationId: 'search-case',
        summary:
          'Search court cases by party name, case number, or query terms via CourtListener.',
        'x-llm-callable': true,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  appId: { type: 'string', description: 'Product app id, e.g. "1" or "2".' },
                  type: { type: 'string', description: 'Search type, e.g. "r" for RECAP.' },
                  order_by: { type: 'string', description: 'Sort order, e.g. "score desc".' },
                  name: { type: 'string', description: 'Saved search/display name for the query.' },
                  q: { type: 'string', description: 'Free-text query terms.' },
                  caseNumberFull: { type: 'string' },
                  lastName: { type: 'string' },
                  firstName: { type: 'string' },
                  caseTitle: { type: 'string' },
                  courtId: { type: 'string' },
                  dateFiledFrom: { type: 'string', format: 'date' },
                  natureOfSuit: { type: 'string' },
                  next: { type: 'string' },
                },
                required: ['appId', 'type', 'order_by', 'name'],
              },
            },
          },
        },
        responses: { 200: { description: 'Matching cases' } },
      },
    },
  },
};

const isJuristaiToolsEnabled = () =>
  /^(1|true|yes|on)$/i.test(process.env.JURISTAI_DJANGO_TOOLS_ENABLED ?? '');

const getBaseUrl = () => process.env.DJANGO_BASE_URL || DEFAULT_DJANGO_BASE_URL;

const getSpecConfig = () => ({
  djangoBaseUrl: getBaseUrl(),
  staticSpec: SEARCH_CASE_SPEC,
});

const getAppId = (req) => {
  const params = req.body?.model_parameters ?? {};
  const promptId = req.body?.prompt_id ?? params.prompt_id ?? params.prompt?.id;
  return promptId ? PROMPT_APP_MAP[promptId] : undefined;
};

const getCatalog = async (req) => {
  try {
    return await loadJuristaiToolCatalog(getSpecConfig(), getAppId(req));
  } catch (error) {
    logger.error('[juristaiTools] Failed to load django-hub tool catalog', error);
    return [];
  }
};

/** Tool names to inject into the agent's tools array (advertising). */
async function getJuristaiToolNames(req) {
  if (!isJuristaiToolsEnabled()) {
    return [];
  }
  const catalog = await getCatalog(req);
  return catalog.map((tool) => tool.name);
}

/** Serializable tool definitions for the requested juristai tool names. */
async function getJuristaiToolDefinitions(req, toolNames) {
  if (!isJuristaiToolsEnabled() || !toolNames || toolNames.length === 0) {
    return [];
  }
  const wanted = new Set(toolNames);
  const catalog = await getCatalog(req);
  return catalog
    .filter((tool) => wanted.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
}

/** Executable tool instances (createActionTool) for the requested names. */
async function loadJuristaiToolsForExecution({ req, res, streamId, toolNames }) {
  if (!isJuristaiToolsEnabled()) {
    return [];
  }
  const wanted = new Set((toolNames ?? []).filter((name) => name.startsWith(JURISTAI_TOOL_PREFIX)));
  if (wanted.size === 0) {
    return [];
  }

  const catalog = await getCatalog(req);
  const domain = getBaseUrl();
  let token;
  try {
    token = mintChatJwt({ id: String(req.user.id), email: req.user.email });
  } catch (error) {
    logger.error('[juristaiTools] Could not mint chat token; skipping django tools', error);
    return [];
  }

  const loadedTools = [];
  for (const def of catalog) {
    if (!wanted.has(def.name)) {
      continue;
    }
    const action = {
      action_id: 'juristai-django',
      metadata: {
        domain,
        api_key: token,
        auth: {
          type: AuthTypeEnum.ServiceHttp,
          authorization_type: AuthorizationTypeEnum.Bearer,
        },
      },
    };

    const tool = await createActionTool({
      res,
      action,
      streamId,
      userId: req.user.id,
      name: def.name,
      zodSchema: def.zodSchema,
      description: def.description,
      requestBuilder: def.requestBuilder,
      useSSRFProtection: true,
    });

    if (tool) {
      loadedTools.push(tool);
    } else {
      logger.warn(`[juristaiTools] Failed to create django tool: ${def.name}`);
    }
  }

  return loadedTools;
}

module.exports = {
  isJuristaiToolsEnabled,
  getJuristaiToolNames,
  getJuristaiToolDefinitions,
  loadJuristaiToolsForExecution,
  JURISTAI_TOOL_PREFIX,
};
