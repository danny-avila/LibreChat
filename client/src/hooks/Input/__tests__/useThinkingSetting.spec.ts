import { renderHook } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import useThinkingSetting from '../useThinkingSetting';

/**
 * Which parameter the composer's thinking control writes. Every provider spells
 * reasoning differently, and resolving the wrong key is silent: the slider
 * moves, the request carries a parameter the model ignores.
 */

let mockEndpointsConfig: Record<string, unknown>;

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: mockEndpointsConfig }),
}));

const setting = (conversation: Partial<TConversation>) =>
  renderHook(() => useThinkingSetting(conversation as TConversation)).result.current;

describe('useThinkingSetting', () => {
  beforeEach(() => {
    mockEndpointsConfig = {};
  });

  it('resolves nothing without a conversation or an endpoint', () => {
    expect(setting({})).toBeNull();
  });

  it.each([
    [EModelEndpoint.anthropic, 'claude-sonnet-4-5', 'effort'],
    [EModelEndpoint.openAI, 'gpt-5', 'reasoning_effort'],
    [EModelEndpoint.google, 'gemini-3-pro-preview', 'thinkingLevel'],
  ])('reads %s as %s', (endpoint, model, expected) => {
    const resolved = setting({ endpoint, model });
    expect(resolved?.key).toBe(expected);
  });

  /* Only a discrete set of levels renders as this slider; a bare numeric budget
     belongs in the parameters panel. */
  it('offers only settings that name their levels', () => {
    const resolved = setting({ endpoint: EModelEndpoint.anthropic, model: 'claude-sonnet-4-5' });
    expect((resolved?.options?.length ?? 0) > 0).toBe(true);
  });

  it('resolves nothing for an endpoint that defines no parameters', () => {
    expect(
      setting({ endpoint: 'SomeCustomEndpoint' as EModelEndpoint, model: 'a-model' }),
    ).toBeNull();
  });

  /* An admin override refines the built-in definition. Replacing it outright
     dropped the levels, and a reasoning setting without levels is not rendered
     at all, so the control silently disappeared. */
  it('keeps the built-in levels when an override names only a default', () => {
    mockEndpointsConfig = {
      [EModelEndpoint.openAI]: {
        customParams: {
          paramDefinitions: [{ key: 'reasoning_effort', default: 'high' }],
        },
      },
    };
    const resolved = setting({ endpoint: EModelEndpoint.openAI, model: 'gpt-5' });
    expect(resolved?.key).toBe('reasoning_effort');
    expect((resolved?.options?.length ?? 0) > 0).toBe(true);
    expect(resolved?.default).toBe('high');
  });
});
