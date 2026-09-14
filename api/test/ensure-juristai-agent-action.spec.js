/**
 * Integration test for the idempotent agent-action seed script
 * (config/ensure-juristai-agent-action.js), the infra-as-code guard for QA
 * finding #CHAT-AGENT-NO-TOOLS-BOUND. Exercises the real array-construction +
 * idempotency logic against a real in-memory Mongo and the real data-schemas
 * Agent/Action methods. Only the deterministic ActionService domain encoders
 * and the DB connect helper are injected, since ActionService's live import
 * chain (flow manager, agents) is not loadable in a unit env.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createMethods, agentSchema, actionSchema } = require('@librechat/data-schemas');

const { ensureJuristaiAgentAction } = require('../../config/ensure-juristai-agent-action');

const AGENT_ID = 'agent_test_juristai';
const DOMAIN = 'https://api-dev.juristai.org';
const SPEC_PATH = require('path').resolve(
  __dirname,
  '..',
  '..',
  'config',
  'juristai-agent-action-spec.json',
);
// Derived from the spec instead of hardcoded, so this test tracks the real
// django llm-tools catalog size instead of needing a manual bump every time
// an operation is added or removed.
const EXPECTED_TOOL_COUNT = Object.values(
  JSON.parse(require('fs').readFileSync(SPEC_PATH, 'utf8')).paths,
).reduce((count, methods) => count + Object.keys(methods).length, 0);

describe('ensure-juristai-agent-action (infra-as-code guard)', () => {
  let mongoServer;
  let Agent;
  let Action;
  let methods;

  const baseDeps = () => ({
    connect: async () => undefined,
    getAgent: methods.getAgent,
    updateAgent: methods.updateAgent,
    getActions: methods.getActions,
    updateAction: methods.updateAction,
    // Deterministic stand-ins for ActionService's domain encoders.
    domainParser: async (domain) => domain.replace(/[^a-zA-Z0-9]/g, '_'),
    legacyDomainEncode: (domain) => domain.replace(/\./g, '_'),
    encryptMetadata: async (metadata) => metadata,
    agentId: AGENT_ID,
    actionDomain: DOMAIN,
    specPath: SPEC_PATH,
  });

  beforeAll(async () => {
    // Keep a missing/unclean Mongo binary from consuming the master-suite
    // budget without producing a Jest result. The test remains backed by a
    // real in-memory Mongo when startup succeeds.
    mongoServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 30000 },
    });
    await mongoose.connect(mongoServer.getUri());
    Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
    Action = mongoose.models.Action || mongoose.model('Action', actionSchema);
    methods = createMethods(mongoose);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
    await Action.deleteMany({});
    await Agent.create({
      id: AGENT_ID,
      name: 'JuristAI Test Agent',
      provider: 'openAI',
      model: 'gpt-4.1',
      author: new mongoose.Types.ObjectId(),
      tools: [],
      actions: [],
    });
  });

  test('dry-run reports the plan without writing to the agent', async () => {
    const result = await ensureJuristaiAgentAction({ dryRun: true, deps: baseDeps() });

    expect(result.dryRun).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.functionCount).toBe(EXPECTED_TOOL_COUNT);

    const agent = await Agent.findOne({ id: AGENT_ID }).lean();
    expect(agent.tools).toHaveLength(0);
    expect(agent.actions).toHaveLength(0);
    expect(await Action.countDocuments({})).toBe(0);
  });

  test('apply mode binds every catalog tool and one action to the agent', async () => {
    const result = await ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() });

    expect(result.changed).toBe(true);
    expect(result.reusedExistingAction).toBe(false);
    expect(result.functionCount).toBe(EXPECTED_TOOL_COUNT);

    const agent = await Agent.findOne({ id: AGENT_ID }).lean();
    expect(agent.tools).toHaveLength(EXPECTED_TOOL_COUNT);
    expect(agent.actions).toHaveLength(1);
    expect(agent.actions[0]).toContain(result.action_id);

    const actions = await Action.find({ agent_id: AGENT_ID }).lean();
    expect(actions).toHaveLength(1);
    expect(actions[0].metadata.domain).toBe(DOMAIN);
    expect(actions[0].metadata.raw_spec).toContain('openapi');
  });

  test('re-running after a successful bind is an idempotent no-op', async () => {
    await ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() });
    const second = await ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() });

    expect(second.changed).toBe(false);
    expect(second.alreadyBound).toBe(true);
    expect(second.reusedExistingAction).toBe(true);

    const agent = await Agent.findOne({ id: AGENT_ID }).lean();
    expect(agent.tools).toHaveLength(EXPECTED_TOOL_COUNT);
    expect(agent.actions).toHaveLength(1);
    expect(await Action.countDocuments({ agent_id: AGENT_ID })).toBe(1);
  });

  test('re-binds when the spec content changes even if tool names are unchanged', async () => {
    const first = await ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() });
    await Action.updateOne(
      { agent_id: AGENT_ID, action_id: first.action_id },
      { $set: { 'metadata.raw_spec': '{"openapi":"3.0.3","paths":{}}' } },
    );

    const resynced = await ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() });

    expect(resynced.specUnchanged).toBe(false);
    expect(resynced.changed).toBe(true);
    expect(resynced.reusedExistingAction).toBe(true);
    expect(resynced.action_id).toBe(first.action_id);

    const actions = await Action.find({ agent_id: AGENT_ID }).lean();
    expect(actions).toHaveLength(1);
    expect(actions[0].metadata.raw_spec).toContain('openapi');
    expect(actions[0].metadata.raw_spec).not.toBe('{"openapi":"3.0.3","paths":{}}');
  });

  test('heals an agent whose tools were wiped, reusing the same action_id', async () => {
    const first = await ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() });
    await Agent.updateOne({ id: AGENT_ID }, { tools: [], actions: [] });

    const healed = await ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() });

    expect(healed.changed).toBe(true);
    expect(healed.reusedExistingAction).toBe(true);
    expect(healed.action_id).toBe(first.action_id);

    const agent = await Agent.findOne({ id: AGENT_ID }).lean();
    expect(agent.tools).toHaveLength(EXPECTED_TOOL_COUNT);
    expect(await Action.countDocuments({ agent_id: AGENT_ID })).toBe(1);
  });

  test('throws a clear error when the agent does not exist', async () => {
    await Agent.deleteMany({});
    await expect(ensureJuristaiAgentAction({ dryRun: false, deps: baseDeps() })).rejects.toThrow(
      /Agent not found/,
    );
  });
});

describe('juristai agent action spec — parity denylist', () => {
  const spec = JSON.parse(require('fs').readFileSync(SPEC_PATH, 'utf8'));
  const operationIds = Object.values(spec.paths).flatMap((methods) =>
    Object.values(methods).map((op) => op.operationId),
  );

  // Destructive access-control / data-loss operations that must never be reachable
  // from the chat agent (mirrored in the email agent's denylist).
  const DENYLIST = [
    'delete-legal-team',
    'remove-legal-team-member',
    'remove-user-from-case',
    'delete-motion-template',
    'delete-motion-template_2',
    'delete-case-important-date',
  ];

  test('none of the denylisted operations are published to the agent', () => {
    const leaked = DENYLIST.filter((op) => operationIds.includes(op));
    expect(leaked).toEqual([]);
  });

  test('legitimate high-value tools remain published (full parity, not staged-safe-66)', () => {
    for (const op of [
      'generate-motion',
      'generate-lawsuit',
      'create-new-case',
      'doc-critique',
      'summarize-document',
      'retrieve-document-summary',
      'send-client-invoice',
      'in-house-request-create',
      'in-house-matter-create',
      'in-house-contract-create',
      'in-house-contract-version-create',
      'in-house-obligation-create',
    ]) {
      expect(operationIds).toContain(op);
    }
    expect(operationIds.length).toBeGreaterThanOrEqual(90);
  });
});
