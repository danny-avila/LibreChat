import { getApiErrorMessage, getApiErrorAgentIds } from '../errors';

const axiosLikeError = (data: unknown): unknown => ({ response: { data } });

describe('getApiErrorMessage', () => {
  it('prefers response.data.error when it is a string', () => {
    const error = axiosLikeError({ error: 'Subagents do not exist', message: 'ignored' });
    expect(getApiErrorMessage(error, 'fallback')).toBe('Subagents do not exist');
  });

  it('uses response.data.message when data.error is absent', () => {
    const error = axiosLikeError({ message: 'Only a message' });
    expect(getApiErrorMessage(error, 'fallback')).toBe('Only a message');
  });

  it('falls back when there is no response (plain Error)', () => {
    expect(getApiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('falls back when data.error is not a string', () => {
    const error = axiosLikeError({ error: { code: 400 }, message: 42 });
    expect(getApiErrorMessage(error, 'fallback')).toBe('fallback');
  });

  it('falls back when data.error is blank', () => {
    const error = axiosLikeError({ error: '   ' });
    expect(getApiErrorMessage(error, 'fallback')).toBe('fallback');
  });
});

describe('getApiErrorAgentIds', () => {
  it('returns agent_ids when it is a non-empty string array', () => {
    const error = axiosLikeError({
      error: 'Subagents do not exist',
      agent_ids: ['agent_1', 'agent_2'],
    });
    expect(getApiErrorAgentIds(error)).toEqual(['agent_1', 'agent_2']);
  });

  it('returns undefined when agent_ids is absent', () => {
    expect(getApiErrorAgentIds(axiosLikeError({ error: 'nope' }))).toBeUndefined();
  });

  it('returns undefined when agent_ids is empty', () => {
    expect(getApiErrorAgentIds(axiosLikeError({ agent_ids: [] }))).toBeUndefined();
  });

  it('returns undefined when agent_ids contains non-strings', () => {
    expect(getApiErrorAgentIds(axiosLikeError({ agent_ids: ['agent_1', 7] }))).toBeUndefined();
  });

  it('returns undefined when there is no response', () => {
    expect(getApiErrorAgentIds(new Error('boom'))).toBeUndefined();
  });
});
