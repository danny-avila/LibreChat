/**
 * @jest-environment jsdom
 */
import { Constants, type Agent } from 'librechat-data-provider';
import type { AgentModelParameters } from 'librechat-data-provider';
import type { FieldNamesMarkedBoolean } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  composeAgentUpdatePayload,
  persistAvatarChanges,
  isAvatarUploadOnlyDirty,
  hasPersistedDirtyFields,
  mayHavePersistedChange,
} from '../AgentPanel';

const createForm = (): AgentForm => ({
  agent: undefined,
  id: 'agent_123',
  name: 'Agent',
  description: null,
  instructions: null,
  model: 'gpt-4',
  model_parameters: {
    temperature: 1,
    maxContextTokens: null,
    max_context_tokens: null,
    max_output_tokens: null,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  },
  tools: [],
  provider: 'openai',
  agent_ids: [],
  edges: [],
  end_after_tools: false,
  hide_sequential_outputs: false,
  recursion_limit: undefined,
  category: 'general',
  support_contact: undefined,
  artifacts: '',
  execute_code: false,
  file_search: false,
  web_search: false,
  avatar_file: null,
  avatar_preview: '',
  avatar_action: null,
});

describe('composeAgentUpdatePayload', () => {
  it('includes avatar: null when resetting a persistent agent', () => {
    const form = createForm();
    form.avatar_action = 'reset';

    const { payload } = composeAgentUpdatePayload(form, 'agent_123');

    expect(payload.avatar).toBeNull();
  });

  it('omits avatar when resetting an ephemeral agent', () => {
    const form = createForm();
    form.avatar_action = 'reset';

    const { payload } = composeAgentUpdatePayload(form, Constants.EPHEMERAL_AGENT_ID);

    expect(payload.avatar).toBeUndefined();
  });

  it('never adds avatar during upload actions', () => {
    const form = createForm();
    form.avatar_action = 'upload';

    const { payload } = composeAgentUpdatePayload(form, 'agent_123');

    expect(payload.avatar).toBeUndefined();
  });

  it('forces stateful_code_sessions off when execute_code is disabled', () => {
    const form = createForm();
    form.execute_code = false;
    form.stateful_code_sessions = true;

    const { payload } = composeAgentUpdatePayload(form, 'agent_123');

    expect(payload.stateful_code_sessions).toBe(false);
  });

  it('preserves stateful_code_sessions when execute_code is enabled', () => {
    const form = createForm();
    form.execute_code = true;
    form.stateful_code_sessions = true;

    const { payload } = composeAgentUpdatePayload(form, 'agent_123');

    expect(payload.stateful_code_sessions).toBe(true);
  });

  it('defaults stateful environments to the scalable user scope', () => {
    const form = createForm();
    form.execute_code = true;
    form.stateful_code_sessions = true;

    const { payload } = composeAgentUpdatePayload(form, 'agent_123');

    expect(payload.stateful_code_environment).toBe('user');
  });

  it('preserves an explicit stateful environment scope', () => {
    const form = createForm();
    form.execute_code = true;
    form.stateful_code_sessions = true;
    form.stateful_code_environment = 'agent-user';

    const { payload } = composeAgentUpdatePayload(form, 'agent_123');

    expect(payload.stateful_code_environment).toBe('agent-user');
  });
});

describe('persistAvatarChanges', () => {
  it('returns false for ephemeral agents', async () => {
    const uploadAvatar = jest.fn();
    const result = await persistAvatarChanges({
      agentId: String(Constants.EPHEMERAL_AGENT_ID),
      avatarActionState: 'upload',
      avatarFile: new File(['avatar'], 'avatar.png', { type: 'image/png' }),
      uploadAvatar,
    });

    expect(result).toBe(false);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('returns false when no upload is pending', async () => {
    const uploadAvatar = jest.fn();
    const result = await persistAvatarChanges({
      agentId: 'agent_123',
      avatarActionState: null,
      avatarFile: null,
      uploadAvatar,
    });

    expect(result).toBe(false);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('uploads avatar when all prerequisites are met', async () => {
    const uploadAvatar = jest.fn().mockResolvedValue({} as Agent);
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    const result = await persistAvatarChanges({
      agentId: 'agent_123',
      avatarActionState: 'upload',
      avatarFile: file,
      uploadAvatar,
    });

    expect(result).toBe(true);
    expect(uploadAvatar).toHaveBeenCalledTimes(1);
    const callArgs = uploadAvatar.mock.calls[0][0];
    expect(callArgs.agent_id).toBe('agent_123');
    expect(callArgs.formData).toBeInstanceOf(FormData);
  });
});

describe('isAvatarUploadOnlyDirty', () => {
  it('detects avatar-only dirty state', () => {
    const dirtyFields = {
      avatar_action: true,
      avatar_preview: true,
    } as FieldNamesMarkedBoolean<AgentForm>;

    expect(isAvatarUploadOnlyDirty(dirtyFields)).toBe(true);
  });

  it('ignores agent field when checking dirty state', () => {
    const dirtyFields = {
      agent: { value: true } as any,
      avatar_file: true,
    } as FieldNamesMarkedBoolean<AgentForm>;

    expect(isAvatarUploadOnlyDirty(dirtyFields)).toBe(true);
  });

  it('returns false when other fields are dirty', () => {
    const dirtyFields = {
      name: true,
    } as FieldNamesMarkedBoolean<AgentForm>;

    expect(isAvatarUploadOnlyDirty(dirtyFields)).toBe(false);
  });
});

describe('hasPersistedDirtyFields', () => {
  it('returns false for an untouched form', () => {
    expect(hasPersistedDirtyFields(undefined)).toBe(false);
    expect(hasPersistedDirtyFields({} as FieldNamesMarkedBoolean<AgentForm>)).toBe(false);
  });

  it('returns false for an upload-only submission, which uses its own endpoint', () => {
    const dirtyFields = {
      avatar_action: true,
      avatar_preview: true,
    } as FieldNamesMarkedBoolean<AgentForm>;

    expect(hasPersistedDirtyFields(dirtyFields, 'upload')).toBe(false);
  });

  it('returns true for a reset-only submission, which is sent as avatar: null', () => {
    const dirtyFields = {
      avatar_action: true,
      avatar_preview: true,
    } as FieldNamesMarkedBoolean<AgentForm>;

    expect(hasPersistedDirtyFields(dirtyFields, 'reset')).toBe(true);
  });

  it('returns true for an edit the update endpoint persists', () => {
    const dirtyFields = {
      avatar_action: true,
      tools: true,
    } as unknown as FieldNamesMarkedBoolean<AgentForm>;

    expect(hasPersistedDirtyFields(dirtyFields)).toBe(true);
  });

  it('ignores the agent field, which tracks selection rather than an edit', () => {
    const dirtyFields = {
      agent: { value: true },
    } as unknown as FieldNamesMarkedBoolean<AgentForm>;

    expect(hasPersistedDirtyFields(dirtyFields)).toBe(false);
  });
});

describe('mayHavePersistedChange', () => {
  const agent = (overrides: Partial<Agent> = {}): Agent =>
    ({
      id: 'agent_123',
      provider: 'openai',
      model: 'gpt-4',
      name: 'Agent',
      tools: ['a'],
      ...overrides,
    }) as Agent;

  it('returns true when anything needed for the comparison is missing', () => {
    /** Without the expanded agent the comparison cannot be trusted, and reporting no
     *  change for a save that did change is the worse error. */
    expect(mayHavePersistedChange(undefined, agent(), agent())).toBe(true);
    expect(mayHavePersistedChange({ name: 'Renamed' }, undefined, agent())).toBe(true);
    expect(mayHavePersistedChange({ name: 'Renamed' }, agent(), undefined)).toBe(true);
  });

  it('returns true when the stored agent came back changed', () => {
    expect(mayHavePersistedChange({ name: 'Renamed' }, agent(), agent({ name: 'Renamed' }))).toBe(
      true,
    );
  });

  it('returns true for a reset that cleared an avatar the agent was carrying', () => {
    const previous = agent({ avatar: { filepath: '/images/a.png', source: 'local' } });

    expect(mayHavePersistedChange({ avatar: null }, previous, agent({ avatar: null }))).toBe(true);
  });

  it('returns false when the server normalized the submission back to the stored value', () => {
    /** An MCP tool rejected by authorization, or a skill pruned because it no longer
     *  exists, is dropped server-side and nothing is persisted. */
    const stored = agent({ tools: ['a'], skills: ['keep'] });

    expect(
      mayHavePersistedChange(
        { tools: ['a', 'mcp_rejected'], skills: ['keep', 'deleted'] },
        stored,
        agent({ tools: ['a'], skills: ['keep'] }),
      ),
    ).toBe(false);
  });

  it('compares nested values rather than object identity', () => {
    const parameters = (temperature: number): AgentModelParameters => ({
      ...createForm().model_parameters,
      temperature,
    });
    const previous = agent({ model_parameters: parameters(1) });

    expect(
      mayHavePersistedChange(
        { model_parameters: parameters(1) },
        previous,
        agent({ model_parameters: parameters(1) }),
      ),
    ).toBe(false);
    expect(
      mayHavePersistedChange(
        { model_parameters: parameters(2) },
        previous,
        agent({ model_parameters: parameters(2) }),
      ),
    ).toBe(true);
  });

  it('ignores fields the submission did not carry', () => {
    expect(
      mayHavePersistedChange({ name: 'Agent' }, agent({ description: 'before' }), agent()),
    ).toBe(false);
  });
});
