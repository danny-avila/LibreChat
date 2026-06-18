import { buildWebSearchContext, buildWebSearchDynamicContext } from './web';

jest.mock('librechat-data-provider', () => ({
  Tools: { web_search: 'web_search' },
  replaceSpecialVars: jest.fn(({ now }: { now?: string }) => now ?? 'NOW'),
}));

describe('web search context', () => {
  it('keeps static context free of volatile date replacements', () => {
    const context = buildWebSearchContext();

    expect(context).toContain('web_search');
    expect(context).not.toContain('NOW');
    expect(context).not.toContain('{{iso_datetime}}');
  });

  it('defaults the model away from searching unless a trigger applies', () => {
    const context = buildWebSearchContext();

    expect(context).toContain('Default: answer from your own knowledge.');
    expect(context).toContain('A search is justified ONLY if you can name a concrete reason');
    expect(context).toContain('is NOT a reason to search');
  });

  it('builds dynamic context from the supplied conversation anchor', () => {
    const context = buildWebSearchDynamicContext('2024-01-02T03:04:05.000Z');
    const secondContext = buildWebSearchDynamicContext('2024-01-02T03:04:05.000Z');

    expect(context).toBe(
      '# `web_search` Runtime Context\nConversation Date & Time: 2024-01-02T03:04:05.000Z',
    );
    expect(secondContext).toBe(context);
  });
});
