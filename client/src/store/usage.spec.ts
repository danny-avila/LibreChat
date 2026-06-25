import { overheadKey, setModelOverhead, getModelOverhead } from './usage';

describe('model overhead cache', () => {
  it('builds a stable key and round-trips overhead per config', () => {
    const key = overheadKey('agents', 'gpt-5', 'agent_123');
    /** Writer (usage handler) and reader (estimate) must build the same key. */
    expect(key).toBe('agents::gpt-5::agent_123');

    /** Unknown config defaults to 0 (estimate falls back to message-only). */
    expect(getModelOverhead(key)).toBe(0);

    setModelOverhead(key, 1500);
    expect(getModelOverhead(key)).toBe(1500);

    /** Non-positive overhead is ignored, keeping the last good value. */
    setModelOverhead(key, 0);
    expect(getModelOverhead(key)).toBe(1500);

    /** A different agent/model is isolated. */
    expect(getModelOverhead(overheadKey('openAI', 'gpt-4', null))).toBe(0);
  });

  it('treats missing endpoint/model/agentId as empty segments', () => {
    expect(overheadKey(undefined, 'gpt-4', undefined)).toBe('::gpt-4::');
  });
});
