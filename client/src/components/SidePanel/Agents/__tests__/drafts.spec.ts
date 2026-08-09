/**
 * @jest-environment jsdom
 */
import { AgentCapabilities } from 'librechat-data-provider';
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { AgentForm, ExtendedFile } from '~/common';
import {
  getAgentDraft,
  saveAgentDraft,
  clearAgentDraft,
  getAgentDraftKey,
  clearAllAgentDrafts,
} from '../drafts';

const createForm = (overrides: Partial<AgentForm> = {}): AgentForm => {
  const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
  const contextFile: ExtendedFile = {
    file,
    file_id: 'file-1',
    size: 12,
    progress: 1,
  };

  return {
    id: 'agent-1',
    name: 'Draft agent',
    description: 'Draft description',
    instructions: 'Draft instructions',
    model: 'gpt-4o',
    model_parameters: {} as AgentForm['model_parameters'],
    tools: ['mcp__server__tool'],
    tool_options: {},
    provider: { label: 'OpenAI', value: 'openAI' },
    category: 'general',
    support_contact: {
      name: '',
      email: '',
    },
    skills: ['skill-1'],
    skills_enabled: true,
    [AgentCapabilities.execute_code]: false,
    [AgentCapabilities.file_search]: true,
    [AgentCapabilities.web_search]: false,
    avatar_file: file,
    avatar_preview: 'data:image/png;base64,abc',
    avatar_action: 'upload',
    agent: {
      id: 'agent-1',
      label: 'Draft agent',
      value: 'agent-1',
      context_files: [['file-1', contextFile]],
    } as AgentForm['agent'],
    ...overrides,
  };
};

describe('agent drafts', () => {
  beforeEach(() => {
    clearAllAgentDrafts();
  });

  it('stores new-agent drafts in memory without avatar uploads or File objects', () => {
    saveAgentDraft(undefined, createForm());

    const draft = getAgentDraft(undefined);
    const agent = draft?.agent;

    expect(draft?.name).toBe('Draft agent');
    expect(draft?.instructions).toBe('Draft instructions');
    expect(draft?.model).toBe('gpt-4o');
    expect(draft?.avatar_file).toBeUndefined();
    expect(draft?.avatar_preview).toBeUndefined();
    expect(draft?.avatar_action).toBeUndefined();
    expect(typeof agent).toBe('object');
    expect(
      typeof agent === 'object' ? agent?.context_files?.[0]?.[1].file : undefined,
    ).toBeUndefined();
  });

  it('keeps drafts isolated by agent id and clears only the requested id', () => {
    saveAgentDraft('agent-a', createForm({ id: 'agent-a', name: 'Agent A' }));
    saveAgentDraft('agent-b', createForm({ id: 'agent-b', name: 'Agent B' }));

    clearAgentDraft('agent-a');

    expect(getAgentDraft('agent-a')).toBeUndefined();
    expect(getAgentDraft('agent-b')?.name).toBe('Agent B');
  });

  it('keeps drafts isolated by user id', () => {
    saveAgentDraft(undefined, createForm({ name: 'User A new draft' }), 'user-a');
    saveAgentDraft(undefined, createForm({ name: 'User B new draft' }), 'user-b');
    saveAgentDraft('agent-1', createForm({ name: 'User A saved-agent draft' }), 'user-a');

    clearAgentDraft(undefined, 'user-a');

    expect(getAgentDraft(undefined, 'user-a')).toBeUndefined();
    expect(getAgentDraft(undefined, 'user-b')?.name).toBe('User B new draft');
    expect(getAgentDraft('agent-1', 'user-a')?.name).toBe('User A saved-agent draft');
    expect(getAgentDraft('agent-1', 'user-b')).toBeUndefined();
  });

  it('preserves avatar reset intent without upload files', () => {
    saveAgentDraft(
      undefined,
      createForm({
        avatar_action: 'reset',
        avatar_file: null,
        avatar_preview: '/images/avatar.png',
      }),
    );

    const draft = getAgentDraft(undefined);

    expect(draft?.avatar_action).toBe('reset');
    expect(draft?.avatar_preview).toBe('');
    expect(draft?.avatar_file).toBeUndefined();
  });

  it('uses nullish draft key fallbacks without rewriting empty strings', () => {
    expect(getAgentDraftKey(undefined, undefined)).toBe('anonymous:new');
    expect(getAgentDraftKey('', '')).toBe(':');
  });
});
