const { logger } = require('@librechat/data-schemas');
const { AuthTypeEnum, AuthorizationTypeEnum } = require('librechat-data-provider');
const {
  loadJuristaiToolCatalog,
  mintChatJwt,
  JURISTAI_TOOL_PREFIX,
  DEFAULT_JURISTAI_APP_ID,
  JURISTAI_PER_APP_OPERATIONS,
  resolveJuristaiAppId,
  isJuristaiAppContextOperation,
} = require('@librechat/api');
const { createActionTool } = require('~/server/services/ActionService');

/**
 * Glue between the django-hub tool catalog (packages/api) and the LibreChat
 * agent loop. Advertises curated Django endpoints as native tools and executes
 * them via createActionTool with a per-request, per-user minted JWT.
 *
 * The whole integration is gated behind JURISTAI_DJANGO_TOOLS_ENABLED so it is
 * a no-op (zero behavior change) unless explicitly turned on.
 *
 * The primary path is live django-hub schema loading. A tiny bundled fallback
 * spec remains available for local/dev environments where schema auth has not
 * been wired yet.
 */

const DEFAULT_DJANGO_BASE_URL = 'https://api-dev.juristai.org';
const DEFAULT_DJANGO_SCHEMA_PATH = '/api/schema/';
const DEFAULT_SCHEMA_REFRESH_SECONDS = 600;

/** Bundled OpenAPI slice for the spike. Mirrors CaseSearchSerializer. */
const SEARCH_CASE_SPEC = {
  openapi: '3.0.0',
  info: { title: 'Jurist Hub API (bundled)', version: '1.0.0' },
  paths: {
    '/api/core/search-case/': {
      post: {
        operationId: 'search-case',
        summary:
          'Search U.S. court cases and dockets via CourtListener. Provide search terms in `q` ' +
          '(and/or party/case filters); the assistant only needs to supply what to search for. ' +
          'Pagination, sort order, search type, and the product context are filled in ' +
          'automatically, so you normally only set `q` (plus optional filters like party names).',
        'x-llm-callable': true,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  q: {
                    type: 'string',
                    description: 'Free-text query: party names, case titles, legal topics, etc.',
                  },
                  name: {
                    type: 'string',
                    description:
                      'Optional short label for this search. Defaults to the query if omitted.',
                  },
                  caseNumberFull: { type: 'string', description: 'Full docket/case number.' },
                  lastName: { type: 'string', description: 'Party last name.' },
                  firstName: { type: 'string', description: 'Party first name.' },
                  caseTitle: { type: 'string', description: 'Case caption/title.' },
                  courtId: { type: 'string', description: 'CourtListener court id, e.g. "ganb".' },
                  dateFiledFrom: { type: 'string', format: 'date', description: 'YYYY-MM-DD.' },
                  natureOfSuit: { type: 'string', description: 'Nature of suit filter.' },
                  type: {
                    type: 'string',
                    description: 'Search type. Leave unset; defaults to "r" (RECAP dockets).',
                  },
                  order_by: {
                    type: 'string',
                    description: 'Sort order. Leave unset; defaults to "score desc".',
                  },
                  appId: {
                    type: 'string',
                    description: 'Set automatically from the active product. Do not populate.',
                  },
                  next: { type: 'string', description: 'Opaque cursor for the next page.' },
                },
                required: [],
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

const getSchemaPath = () => process.env.JURISTAI_DJANGO_SCHEMA_PATH || DEFAULT_DJANGO_SCHEMA_PATH;

const getSchemaAuthToken = () =>
  process.env.JURISTAI_DJANGO_SCHEMA_AUTH_TOKEN || process.env.DJANGO_SCHEMA_AUTH_TOKEN;

const getSchemaRefreshSeconds = () => {
  const parsed = Number.parseInt(process.env.JURISTAI_DJANGO_SCHEMA_REFRESH_SECONDS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SCHEMA_REFRESH_SECONDS;
};

const isStaticFallbackEnabled = () => {
  const raw = process.env.JURISTAI_DJANGO_TOOLS_STATIC_FALLBACK_ENABLED;
  if (raw != null) {
    return /^(1|true|yes|on)$/i.test(raw);
  }
  return process.env.NODE_ENV !== 'production';
};

const getSpecConfig = () => ({
  djangoBaseUrl: getBaseUrl(),
  schemaPath: getSchemaPath(),
  refreshSeconds: getSchemaRefreshSeconds(),
  schemaAuthToken: getSchemaAuthToken(),
  perAppOperations: JURISTAI_PER_APP_OPERATIONS,
});

const getAppId = (req) => {
  const params = req.body?.model_parameters ?? {};
  const additionalFields =
    req.body?.additionalModelRequestFields ??
    req.body?.endpointOption?.additionalModelRequestFields ??
    {};
  const promptId = req.body?.prompt_id ?? params.prompt_id ?? params.prompt?.id;
  return resolveJuristaiAppId(
    req.body?.appId ?? params.appId ?? additionalFields.appId,
    promptId,
    JURISTAI_PER_APP_OPERATIONS,
    DEFAULT_JURISTAI_APP_ID,
  );
};

const SEARCH_CASE_TOOL = `${JURISTAI_TOOL_PREFIX}search-case`;
const JURISTAI_TOOL_CONTEXT_BODY_KEYS = ['juristaiToolContext', 'toolContext'];
const MILESTONE_ONE_ALIAS_TO_OPERATION_IDS = Object.freeze({
  search_case: ['search-case'],
  retrieve_my_cases: ['list-my-cases'],
  get_case_metadata: ['get-case-metadata'],
  retrieve_case_details: ['get-case-metadata'],
  generate_case_summary: ['generate-case-summary'],
  retrieve_case_summary: ['retrieve-case-summary'],
  retrieve_case_action_items: ['list-action-items'],
  retrieve_case_important_dates: ['list-case-important-dates'],
  retrieve_case_timeline: ['list-case-timeline'],
  retrieve_case_calendar: ['get-case-calendar'],
  retrieve_latest_docket_entry: ['get-latest-docket-entry'],
  people_insight: ['read-people-dossiers'],
  search_precedents: ['precedent-query'],
  query_processor: ['query-processor'],
  deadlines_insight: ['deadlines-insight'],
  summarize_document: ['summarize-document'],
  doc_critique: ['doc-critique'],
  lawsuit_recommendation: ['recommend-lawsuit'],
  legal_team_invite: ['legal-team-invite'],
  accept_legal_team_invite: ['accept-legal-team-invite'],
  manage_legal_team: [
    'list-legal-team-members',
    'rename-legal-team',
    'remove-legal-team-member',
    'assign-legal-team-to-case',
    'delete-legal-team',
  ],
  list_legal_team_members: ['list-legal-team-members'],
  rename_legal_team: ['rename-legal-team'],
  remove_legal_team_member: ['remove-legal-team-member'],
  assign_legal_team_to_case: ['assign-legal-team-to-case'],
  delete_legal_team: ['delete-legal-team'],
  manage_organization: ['list-organization-members'],
  account_manager: ['account-manager'],
  retrieve_case_billing_summary: ['retrieve-case-billing-summary'],
  generate_case_bill: ['generate-case-bill'],
  list_host_scheduling_schedules: ['list-host-scheduling-schedules'],
  create_scheduling_schedule: ['create-scheduling-schedule'],
  update_scheduling_schedule: ['update-scheduling-schedule'],
  list_host_scheduling_event_types: ['list-host-scheduling-event-types'],
  create_scheduling_event_type: ['create-scheduling-event-type'],
  update_scheduling_event_type: ['update-scheduling-event-type'],
  get_public_scheduling_link: ['get-public-scheduling-link'],
  search_scheduling_slots: ['search-scheduling-slots'],
  create_scheduling_reservation: ['create-scheduling-reservation'],
  delete_scheduling_reservation: ['delete-scheduling-reservation'],
  list_host_scheduling_bookings: ['list-host-scheduling-bookings'],
  create_scheduling_booking: ['create-scheduling-booking'],
  cancel_scheduling_booking: ['cancel-scheduling-booking'],
  reschedule_scheduling_booking: ['reschedule-scheduling-booking'],
  confirm_scheduling_booking: ['confirm-scheduling-booking'],
  retry_scheduling_conferencing: ['retry-scheduling-conferencing'],
  connect_scheduling_conferencing: ['connect-scheduling-conferencing'],
  disconnect_scheduling_conferencing: ['disconnect-scheduling-conferencing'],
  create_signature_request: ['create-signature-request'],
  list_case_signatures: ['list-case-signatures'],
  get_signature_request_detail: ['get-signature-request-detail'],
  send_signature_reminder: ['send-signature-reminder'],
  void_signature_request: ['void-signature-request'],
  create_self_sign_session: ['create-self-sign-session'],
  reconcile_signature_request: ['reconcile-signature-request'],
  create_case_action_item: ['create-action-item'],
  update_case_action_item: ['update-action-item'],
  assign_case_action_item: ['assign-action-item'],
  complete_case_action_item: ['complete-action-item'],
  create_case_important_date: ['create-case-important-date'],
  update_case_important_date: ['update-case-important-date'],
  delete_case_important_date: ['delete-case-important-date'],
  assign_user_to_case: ['assign-user-to-case'],
  remove_user_from_case: ['remove-user-from-case'],
  start_motion_generation: ['generate-motion'],
  start_demand_letter_generation: ['demand-letter'],
  start_lawsuit_generation: ['generate-lawsuit'],
});
const WORKFLOW_STARTER_OPERATION_IDS = new Set([
  'generate-motion',
  'demand-letter',
  'generate-lawsuit',
]);

/**
 * Fills the django-hub-required fields the model can't reasonably know.
 * `appId` is forced from the request's product context; `type`/`order_by`/`name`
 * get sensible defaults when the model omits them. Model-supplied values win,
 * except `appId` which is always server-controlled.
 */
const applySharedDefaults = (args, req, toolName) => {
  const merged = { ...(args ?? {}) };
  const operationId = toolName.replace(JURISTAI_TOOL_PREFIX, '');
  if (isJuristaiAppContextOperation(operationId) || Object.hasOwn(merged, 'appId')) {
    merged.appId = getAppId(req);
  }
  return merged;
};

const applySearchCaseDefaults = (args, req) => {
  const merged = applySharedDefaults(args, req, SEARCH_CASE_TOOL);
  if (!merged.type) {
    merged.type = 'r';
  }
  if (!merged.order_by) {
    merged.order_by = 'score desc';
  }
  if (!merged.name) {
    merged.name = merged.q ? `Assistant search: ${merged.q}` : 'Assistant case search';
  }
  return merged;
};

const applyWorkflowStarterDefaults = (args, req, toolName) => {
  const merged = applySharedDefaults(args, req, toolName);
  if (merged.asyncInvoke !== true) {
    merged.asyncInvoke = true;
  }
  return merged;
};

const TOOL_DEFAULT_APPLIERS = {
  [SEARCH_CASE_TOOL]: applySearchCaseDefaults,
};

const applyToolDefaults = (toolName, input, req) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const operationId = toolName.replace(JURISTAI_TOOL_PREFIX, '');
  const applyDefaults =
    TOOL_DEFAULT_APPLIERS[toolName] ??
    (WORKFLOW_STARTER_OPERATION_IDS.has(operationId)
      ? applyWorkflowStarterDefaults
      : applySharedDefaults);
  return applyDefaults(input, req, toolName);
};

const readRequestedToolEntries = (req) => {
  for (const key of JURISTAI_TOOL_CONTEXT_BODY_KEYS) {
    const value = req.body?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const availableTools = value.availableTools;
      if (Array.isArray(availableTools)) {
        return availableTools;
      }
    }
  }
  return [];
};

const normalizeRequestedToolTokens = (req) => {
  const tokens = new Set();
  for (const entry of readRequestedToolEntries(req)) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) {
        tokens.add(trimmed);
      }
      continue;
    }
    if (entry && typeof entry === 'object') {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const operationId = typeof entry.operationId === 'string' ? entry.operationId.trim() : '';
      const operationIds = Array.isArray(entry.operationIds)
        ? entry.operationIds
            .filter((value) => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      if (name) {
        tokens.add(name);
      }
      if (operationId) {
        tokens.add(operationId);
      }
      for (const value of operationIds) {
        tokens.add(value);
      }
    }
  }
  return tokens;
};

const resolveCatalogSubset = (catalog, req) => {
  const requested = normalizeRequestedToolTokens(req);
  if (requested.size === 0) {
    return catalog;
  }

  const directToolNames = new Set();
  const directOperationIds = new Set();
  for (const token of requested) {
    if (token.startsWith(JURISTAI_TOOL_PREFIX)) {
      directToolNames.add(token);
      continue;
    }
    directOperationIds.add(token);
    for (const aliasOperationId of MILESTONE_ONE_ALIAS_TO_OPERATION_IDS[token] ?? []) {
      directOperationIds.add(aliasOperationId);
    }
  }

  const filtered = catalog.filter((tool) => {
    if (directToolNames.has(tool.name)) {
      return true;
    }
    if (directOperationIds.has(tool.operationId)) {
      return true;
    }
    const toolSuffix = tool.name.startsWith(JURISTAI_TOOL_PREFIX)
      ? tool.name.slice(JURISTAI_TOOL_PREFIX.length)
      : tool.name;
    return directOperationIds.has(toolSuffix);
  });

  logger.debug('[juristaiTools] Applied request tool scope', {
    appId: getAppId(req),
    requestedTools: Array.from(requested),
    resolvedToolNames: filtered.map((tool) => tool.name),
  });
  return filtered;
};

const extractHttpStatus = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = value.match(/\bstatus\s+(\d{3})\b/i);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isTransientStatus = (status) =>
  status === 408 || status === 429 || (status >= 500 && status < 600);

const classifyToolOutcome = (output) => {
  if (typeof output !== 'string') {
    return 'success';
  }
  const status = extractHttpStatus(output);
  if (status === 401 || status === 403) {
    return 'authorization_error';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 409) {
    return 'conflict';
  }
  if (status === 400 || status === 422) {
    return 'validation_error';
  }
  if (
    isTransientStatus(status) ||
    output.includes('timed out') ||
    output.includes('No response received')
  ) {
    return 'transient_upstream_failure';
  }
  return 'success';
};

const classifyToolFailure = (error) => {
  const message = error?.message ?? '';
  if (message.includes('401') || message.includes('403')) {
    return 'authorization_error';
  }
  if (message.includes('404')) {
    return 'not_found';
  }
  if (message.includes('409')) {
    return 'conflict';
  }
  if (message.includes('400') || message.includes('422')) {
    return 'validation_error';
  }
  return 'transient_upstream_failure';
};

const sanitizeErrorMessage = (value) => {
  if (typeof value !== 'string') {
    return 'JuristAI tool execution failed.';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, 600);
};

const buildNormalizedErrorPayload = (toolName, outcome, rawMessage) => {
  const messageByOutcome = {
    authorization_error: 'Authorization failed for this JuristAI action.',
    not_found: 'The requested JuristAI resource was not found.',
    conflict:
      'This JuristAI action could not be completed because the current state conflicts with the request.',
    validation_error:
      'JuristAI rejected the tool input. Review the arguments and request any missing required details.',
    transient_upstream_failure:
      'JuristAI is temporarily unavailable or timed out. Retry only if the action is still needed.',
  };
  return JSON.stringify({
    ok: false,
    tool: toolName,
    errorType: outcome,
    retryable: outcome === 'transient_upstream_failure',
    message: messageByOutcome[outcome] ?? 'JuristAI tool execution failed.',
    details: sanitizeErrorMessage(rawMessage),
  });
};

const normalizeToolOutput = (toolName, output) => {
  const outcome = classifyToolOutcome(output);
  if (outcome === 'success') {
    return output;
  }
  return buildNormalizedErrorPayload(toolName, outcome, output);
};

const logCatalogEvent = (event, req, toolNames) => {
  logger.debug(`[juristaiTools] ${event}`, {
    appId: getAppId(req),
    promptId: req.body?.prompt_id ?? req.body?.model_parameters?.prompt_id,
    toolCount: toolNames.length,
    toolNames,
  });
};

/**
 * Wraps a tool so server-side defaults are merged into the model's arguments
 * before execution, without disturbing the underlying StructuredTool. Only
 * `invoke` is intercepted; every other property/method is delegated with `this`
 * bound to the original tool.
 */
const withServerDefaults = (tool, toolName, req) => {
  const boundInvoke = typeof tool.invoke === 'function' ? tool.invoke.bind(tool) : null;
  const boundCall = typeof tool._call === 'function' ? tool._call.bind(tool) : null;
  return new Proxy(tool, {
    get(target, prop, receiver) {
      if (prop === 'invoke') {
        if (!boundInvoke) {
          return undefined;
        }
        return async (input, config) => {
          const startedAt = Date.now();
          try {
            const rawOutput = await boundInvoke(applyToolDefaults(toolName, input, req), config);
            const outcome = classifyToolOutcome(rawOutput);
            const output = normalizeToolOutput(toolName, rawOutput);
            logger.debug('[juristaiTools] Tool completed', {
              toolName,
              appId: getAppId(req),
              latencyMs: Date.now() - startedAt,
              outcome,
            });
            return output;
          } catch (error) {
            logger.error('[juristaiTools] Tool failed', {
              toolName,
              appId: getAppId(req),
              latencyMs: Date.now() - startedAt,
              outcome: classifyToolFailure(error),
              error: error?.message ?? String(error),
            });
            throw error;
          }
        };
      }
      if (prop === '_call') {
        if (!boundCall) {
          return undefined;
        }
        return async (input, config) => {
          const startedAt = Date.now();
          try {
            const rawOutput = await boundCall(applyToolDefaults(toolName, input, req), config);
            const outcome = classifyToolOutcome(rawOutput);
            const output = normalizeToolOutput(toolName, rawOutput);
            logger.debug('[juristaiTools] Tool completed', {
              toolName,
              appId: getAppId(req),
              latencyMs: Date.now() - startedAt,
              outcome,
            });
            return output;
          } catch (error) {
            logger.error('[juristaiTools] Tool failed', {
              toolName,
              appId: getAppId(req),
              latencyMs: Date.now() - startedAt,
              outcome: classifyToolFailure(error),
              error: error?.message ?? String(error),
            });
            throw error;
          }
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

const getCatalog = async (req) => {
  const specConfig = getSpecConfig();
  try {
    const catalog = await loadJuristaiToolCatalog(specConfig, getAppId(req));
    return resolveCatalogSubset(catalog, req);
  } catch (error) {
    logger.error('[juristaiTools] Failed to load live django-hub tool catalog', {
      baseUrl: specConfig.djangoBaseUrl,
      schemaPath: specConfig.schemaPath,
      error: error?.message ?? String(error),
    });
    if (isStaticFallbackEnabled()) {
      try {
        logger.warn('[juristaiTools] Falling back to bundled JuristAI tool spec', {
          appId: getAppId(req),
        });
        return await loadJuristaiToolCatalog(
          {
            ...specConfig,
            staticSpec: SEARCH_CASE_SPEC,
          },
          getAppId(req),
        ).then((catalog) => resolveCatalogSubset(catalog, req));
      } catch (fallbackError) {
        logger.error('[juristaiTools] Failed to load fallback JuristAI tool catalog', {
          error: fallbackError?.message ?? String(fallbackError),
        });
      }
    }
    return [];
  }
};

/** Tool names to inject into the agent's tools array (advertising). */
async function getJuristaiToolNames(req) {
  if (!isJuristaiToolsEnabled()) {
    return [];
  }
  const catalog = await getCatalog(req);
  const toolNames = catalog.map((tool) => tool.name);
  logCatalogEvent('Advertised tool catalog', req, toolNames);
  return toolNames;
}

/** Serializable tool definitions for the requested juristai tool names. */
async function getJuristaiToolDefinitions(req, toolNames) {
  if (!isJuristaiToolsEnabled() || !toolNames || toolNames.length === 0) {
    return [];
  }
  const wanted = new Set(toolNames);
  const catalog = await getCatalog(req);
  const definitions = catalog
    .filter((tool) => wanted.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  logCatalogEvent(
    'Loaded tool definitions',
    req,
    definitions.map((tool) => tool.name),
  );
  return definitions;
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
      loadedTools.push(withServerDefaults(tool, def.name, req));
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
