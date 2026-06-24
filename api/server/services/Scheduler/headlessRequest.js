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
 * `handleError` (`@librechat/api`) reports failures by writing an
 * `event: error\ndata: <json message>` frame and ending the response. With a
 * pure no-op `res` that reason is lost, surfacing only a generic wrapper
 * error. We capture any such frame on `res.capturedError` so the runner can
 * rethrow the real cause.
 *
 * @returns {object} res-like object
 */
function buildHeadlessRes() {
  const res = {
    headersSent: false,
    writableEnded: false,
    finished: false,
    locals: {},
    capturedError: undefined,
    write: (chunk) => {
      if (typeof chunk === 'string' && chunk.includes('event: error')) {
        const match = chunk.match(/data: (.*)\n/);
        if (match) {
          try {
            res.capturedError = JSON.parse(match[1]);
          } catch {
            res.capturedError = match[1];
          }
        }
      }
      return true;
    },
    end: () => {},
    json: (payload) => {
      if (payload && (payload.error || payload.text)) {
        res.capturedError = payload.error || payload.text;
      }
      return res;
    },
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
 * Resolves which endpoint/model/agent a scheduled run should execute under.
 * Priority: an explicitly chosen agent, then an explicit endpoint on the
 * schedule, then the deployment's default model spec. Skills run through the
 * agents pipeline either way (a non-agent target becomes an ephemeral agent
 * wrapping the resolved base model).
 *
 * Without this fallback, a schedule created with only a skill + prompt (the
 * form leaves the agent optional) would carry no endpoint and fail at
 * `parseCompactConvo` with "undefined endpoint".
 *
 * @param {object} schedule
 * @param {object} appConfig
 * @returns {{ agent_id?: string, endpoint: string, endpointType?: string, model?: string, spec?: string }}
 */
function resolveRunTarget(schedule, appConfig) {
  if (schedule.agent_id) {
    return { agent_id: schedule.agent_id, endpoint: EModelEndpoint.agents };
  }

  if (schedule.endpoint) {
    return {
      endpoint: schedule.endpoint,
      endpointType: schedule.endpointType,
      model: schedule.model,
      spec: schedule.spec,
    };
  }

  const specs = appConfig?.modelSpecs?.list ?? [];
  const defaultSpec = specs.find((s) => s.default) ?? specs[0];
  if (!defaultSpec?.preset?.endpoint) {
    throw new Error(
      'Scheduled run has no agent or endpoint, and no default model spec is configured',
    );
  }

  return {
    endpoint: defaultSpec.preset.endpoint,
    endpointType: defaultSpec.preset.endpointType,
    model: defaultSpec.preset.model,
    spec: defaultSpec.name,
  };
}

/**
 * Translates a schedule into the request body the agent pipeline expects.
 * Agent schedules run on the `agents` endpoint; otherwise the resolved
 * endpoint/model (explicit or default model spec) is used and the ephemeral
 * skills toggle is set so the primed skill resolves.
 *
 * @param {{ schedule: object, conversationId: string, target: object }} params
 * @returns {object} request body
 */
function buildRunBody({ schedule, conversationId, target }) {
  const isAgent = !!target.agent_id;
  const body = {
    conversationId,
    parentMessageId: Constants.NO_PARENT,
    endpoint: target.endpoint,
    endpointType: target.endpointType,
    agent_id: target.agent_id,
    model: target.model,
    spec: target.spec,
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

module.exports = { buildHeadlessReq, buildHeadlessRes, buildRunBody, resolveRunTarget };
