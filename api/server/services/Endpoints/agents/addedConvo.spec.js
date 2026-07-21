const mockInitializeAgent = jest.fn();
const mockValidateAgentModel = jest.fn();
const mockLoadAddedAgent = jest.fn();
const mockResolveAgentScopedSkillIds = jest.fn();
const mockResolveModelSpecSkillIds = jest.fn();
const mockCanAuthorSkillFiles = jest.fn();
const mockGetAgent = jest.fn();
const mockGetMCPServerTools = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  ADDED_AGENT_ID: '__added_agent__',
  initializeAgent: (...args) => mockInitializeAgent(...args),
  validateAgentModel: (...args) => mockValidateAgentModel(...args),
  loadAddedAgent: (params) => mockLoadAddedAgent(params),
  resolveAgentScopedSkillIds: (...args) => mockResolveAgentScopedSkillIds(...args),
  resolveModelSpecSkillIds: (...args) => mockResolveModelSpecSkillIds(...args),
}));

jest.mock('~/server/services/Files/permissions', () => ({
  filterFilesByAgentAccess: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getMCPServerTools: (...args) => mockGetMCPServerTools(...args),
}));

jest.mock('./skillDeps', () => ({
  canAuthorSkillFiles: (...args) => mockCanAuthorSkillFiles(...args),
}));

jest.mock('~/models', () => ({
  getAgent: (...args) => mockGetAgent(...args),
  getSkillByName: jest.fn(),
  listSkillsByAccess: jest.fn(),
  listAlwaysApplySkills: jest.fn(),
}));

const { processAddedConvo } = require('./addedConvo');
const db = require('~/models');
const { Constants } = require('librechat-data-provider');

const makeReq = () => ({ user: { id: 'u1', role: 'USER' } });

/**
 * Phase 8 pins `processAddedConvo` forwarding the run's `codeEnvAvailable` to
 * the added-convo `initializeAgent` call. Without this, parallel multi-convo
 * agents with `tools: ['execute_code']` silently drop `bash_tool` + `read_file`
 * even though the primary had them — pre-Phase-8 the legacy
 * `CodeExecutionToolDefinition` landed in their `toolDefinitions` via the
 * registry regardless of any explicit flag.
 */
describe('processAddedConvo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateAgentModel.mockResolvedValue({ isValid: true });
    mockInitializeAgent.mockResolvedValue({
      id: 'added-agent',
      userMCPAuthMap: undefined,
    });
    mockLoadAddedAgent.mockResolvedValue({ id: 'added-agent', provider: 'openai' });
    mockResolveAgentScopedSkillIds.mockImplementation(
      ({ accessibleSkillIds }) => accessibleSkillIds,
    );
    mockResolveModelSpecSkillIds.mockResolvedValue([]);
    mockCanAuthorSkillFiles.mockReturnValue(false);
  });

  const baseParams = (overrides = {}) => ({
    req: makeReq(),
    res: {},
    endpointOption: { addedConvo: { model: 'gpt-4o', agent_id: 'added-agent' } },
    modelsConfig: { openai: ['gpt-4o'] },
    logViolation: jest.fn(),
    loadTools: jest.fn(),
    requestFiles: [],
    conversationId: 'conv-1',
    parentMessageId: null,
    allowedProviders: new Set(['openai']),
    agentConfigs: new Map(),
    primaryAgentId: 'primary-id',
    primaryAgent: { id: 'primary-id' },
    userMCPAuthMap: undefined,
    ...overrides,
  });

  it('forwards codeEnvAvailable=true to the added-convo initializeAgent call', async () => {
    await processAddedConvo(baseParams({ codeEnvAvailable: true }));

    expect(mockInitializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ codeEnvAvailable: true }),
      expect.anything(),
    );
  });

  it('forwards codeEnvAvailable=false verbatim (not coerced to undefined)', async () => {
    /* Symmetric coverage: if the runtime gate is off for the primary, the
       parallel agent must not accidentally re-enable code execution via a
       defaulting bug in the destructuring. */
    await processAddedConvo(baseParams({ codeEnvAvailable: false }));

    expect(mockInitializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ codeEnvAvailable: false }),
      expect.anything(),
    );
  });

  it('forwards codeEnvAvailable=undefined when caller omits it (no silent default)', async () => {
    /* Backstop for the "caller didn't update after Phase 8" case — the
       added-convo path must not invent a truthy value out of thin air.
       Matches `initializeAgent`'s own "explicit opt-in" semantics. */
    await processAddedConvo(baseParams());

    expect(mockInitializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ codeEnvAvailable: undefined }),
      expect.anything(),
    );
  });

  it('resolves and forwards model-spec skill scope for added ephemeral agents', async () => {
    const accessibleSkillId = { toString: () => 'accessible-skill' };
    const editableSkillId = { toString: () => 'editable-skill' };
    const resolvedSkillId = { toString: () => 'resolved-skill' };
    const scopedSkillId = { toString: () => 'scoped-skill' };
    const scopedEditableSkillId = { toString: () => 'scoped-editable-skill' };
    const skillStates = { 'scoped-skill': true };

    mockLoadAddedAgent.mockResolvedValue({
      id: Constants.EPHEMERAL_AGENT_ID,
      provider: 'openai',
      skills_enabled: true,
      skills: [],
    });
    mockResolveModelSpecSkillIds.mockResolvedValue([resolvedSkillId]);
    mockResolveAgentScopedSkillIds
      .mockReturnValueOnce([scopedSkillId])
      .mockReturnValueOnce([scopedEditableSkillId]);
    mockCanAuthorSkillFiles.mockReturnValue(true);

    await processAddedConvo(
      baseParams({
        req: {
          user: { id: 'u1', role: 'USER' },
          config: {
            modelSpecs: {
              list: [
                {
                  name: 'added-spec',
                  skills: ['finance-analyst'],
                },
              ],
            },
          },
        },
        endpointOption: {
          spec: 'primary-spec',
          addedConvo: {
            endpoint: 'openai',
            model: 'gpt-4o',
            spec: 'added-spec',
          },
        },
        accessibleSkillIds: [accessibleSkillId],
        editableSkillIds: [editableSkillId],
        skillsCapabilityEnabled: true,
        ephemeralSkillsToggle: false,
        skillCreateAllowed: true,
        skillStates,
        defaultActiveOnShare: true,
      }),
    );

    expect(mockResolveModelSpecSkillIds).toHaveBeenCalledWith({
      names: ['finance-analyst'],
      accessibleSkillIds: [accessibleSkillId],
      getSkillByName: db.getSkillByName,
    });
    expect(mockResolveAgentScopedSkillIds).toHaveBeenNthCalledWith(1, {
      agent: expect.objectContaining({
        id: Constants.EPHEMERAL_AGENT_ID,
        skills_enabled: true,
        skills: ['resolved-skill'],
      }),
      accessibleSkillIds: [accessibleSkillId],
      skillsCapabilityEnabled: true,
      ephemeralSkillsToggle: false,
    });
    expect(mockResolveAgentScopedSkillIds).toHaveBeenNthCalledWith(2, {
      agent: expect.objectContaining({
        id: Constants.EPHEMERAL_AGENT_ID,
        skills_enabled: true,
        skills: ['resolved-skill'],
      }),
      accessibleSkillIds: [editableSkillId],
      skillsCapabilityEnabled: true,
      ephemeralSkillsToggle: false,
    });
    expect(mockCanAuthorSkillFiles).toHaveBeenCalledWith({
      agent: expect.objectContaining({
        id: Constants.EPHEMERAL_AGENT_ID,
        skills_enabled: true,
        skills: ['resolved-skill'],
      }),
      scopedEditableSkillIds: [scopedEditableSkillId],
      skillCreateAllowed: true,
      skillsCapabilityEnabled: true,
      ephemeralSkillsToggle: false,
    });
    expect(mockInitializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        accessibleSkillIds: [scopedSkillId],
        skillAuthoringAvailable: true,
        skillStates,
        defaultActiveOnShare: true,
      }),
      expect.objectContaining({
        listSkillsByAccess: db.listSkillsByAccess,
        listAlwaysApplySkills: db.listAlwaysApplySkills,
        getSkillByName: db.getSkillByName,
      }),
    );
  });
});
