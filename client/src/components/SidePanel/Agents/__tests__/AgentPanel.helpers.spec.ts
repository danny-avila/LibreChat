/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { Constants, type Agent } from 'librechat-data-provider';
import type { FieldNamesMarkedBoolean } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  composeAgentUpdatePayload,
  persistAvatarChanges,
  isAvatarUploadOnlyDirty,
} from '../AgentPanel';

const createForm = (): AgentForm => ({
  agent: undefined,
  id: 'agent_123',
  name: 'Agent',
  description: null,
  instructions: null,
  model: 'gpt-4',
  model_parameters: {},
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
});

describe('persistAvatarChanges', () => {
  it('returns false for ephemeral agents', async () => {
    const uploadAvatar = jest.fn();
    const result = await persistAvatarChanges({
      agentId: Constants.EPHEMERAL_AGENT_ID,
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
