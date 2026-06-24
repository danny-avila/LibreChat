const { Constants, EModelEndpoint, EndpointURLs } = require('librechat-data-provider');

/**
 * Forces `buildEndpointOption` down the agents builder (which handles both
 * saved agents via `agent_id` and ephemeral model-only runs). The middleware
 * gates on `req.baseUrl.startsWith(EndpointURLs[agents])`, so we set the
 * baseUrl to that exact value.
 */
const AGENTS_BASE_URL = EndpointURLs[EModelEndpoint.agents];

/**
 * Builds a minimal Express-like request for a headless (no live HTTP) agent
 * run. Only the fields the agent pipeline actually reads are populated:
 * `user`, `config` (app config), `body`, and the URL bits `buildEndpointOption`
 * inspects (`baseUrl`).
 *
 * @param {{ user: object, appConfig: object, body: object }} params
 * @returns {object} req-like object
 */
function buildHeadlessReq({ user, appConfig, body }) {
  return {
    user,
    config: appConfig,
    app: { locals: {} },
    baseUrl: AGENTS_BASE_URL,
    originalUrl: AGENTS_BASE_URL,
    path: '/',
    method: 'POST',
    headers: {},
    query: {},
    params: {},
    body,
    on: () => {},
  };
}

/**
 * Stub response object. The resumable controller already proves a near-noop
 * `res` is sufficient (it sends JSON immediately and streams via the job
 * manager). Headless runs skip SSE entirely, so every method is a no-op.
 *
 * @returns {object} res-like object
 */
function buildHeadlessRes() {
  const res = {
    headersSent: false,
    writableEnded: false,
    finished: false,
    locals: {},
    write: () => true,
    end: () => {},
    json: () => res,
    send: () => res,
    setHeader: () => {},
    getHeader: () => undefined,
    removeHeader: () => {},
    writeHead: () => res,
    flushHeaders: () => {},
    flush: () => {},
    on: () => {},
    once: () => {},
    off: () => {},
    removeListener: () => {},
    emit: () => false,
  };
  res.status = () => res;
  return res;
}

/**
 * Translates a schedule into the request body the agent pipeline expects.
 * Agent schedules run on the `agents` endpoint; otherwise the configured
 * endpoint/model is used and the ephemeral skills toggle is set so the
 * primed skill resolves.
 *
 * @param {{ schedule: object, conversationId: string }} params
 * @returns {object} request body
 */
function buildRunBody({ schedule, conversationId }) {
  const isAgent = !!schedule.agent_id;
  const body = {
    conversationId,
    parentMessageId: Constants.NO_PARENT,
    endpoint: isAgent ? EModelEndpoint.agents : schedule.endpoint,
    endpointType: isAgent ? undefined : schedule.endpointType,
    agent_id: schedule.agent_id,
    model: schedule.model,
    spec: schedule.spec,
    isTemporary: false,
  };
  if (schedule.skillName) {
    body.manualSkills = [schedule.skillName];
  }
  if (!isAgent) {
    body.ephemeralAgent = { skills: true };
  }
  return body;
}

module.exports = { buildHeadlessReq, buildHeadlessRes, buildRunBody };
