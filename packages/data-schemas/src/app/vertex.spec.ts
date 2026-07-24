import { defaultVertexModels } from './vertex';

describe('defaultVertexModels', () => {
  /**
   * `loadEndpoints` swaps the shared Anthropic model list for the Vertex model
   * names, which fall back to these defaults when `vertex.models` is omitted.
   * A model missing here is invisible to every Vertex deployment that has not
   * enumerated models by hand.
   */
  it('includes the modern Opus family served by Vertex', () => {
    expect(defaultVertexModels).toEqual(
      expect.arrayContaining([
        'claude-opus-5',
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-opus-4-6',
      ]),
    );
  });

  it('keeps the modern Sonnet models', () => {
    expect(defaultVertexModels).toEqual(
      expect.arrayContaining(['claude-sonnet-5', 'claude-sonnet-4-6']),
    );
  });

  it('uses bare IDs for the 4.6+ generation and @-dated IDs for older models', () => {
    const modern = defaultVertexModels.filter((model) =>
      /claude-(?:opus|sonnet)-(?:4-[6-9]|[5-9])$/.test(model),
    );
    expect(modern.length).toBeGreaterThan(0);
    modern.forEach((model) => expect(model).not.toContain('@'));

    expect(defaultVertexModels).toContain('claude-3-opus@20240229');
  });

  it('has no duplicate entries', () => {
    expect(new Set(defaultVertexModels).size).toBe(defaultVertexModels.length);
  });
});
