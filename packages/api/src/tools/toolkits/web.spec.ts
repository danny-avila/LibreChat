import { buildWebSearchContext, buildWebSearchDynamicContext } from './web';

const MAX_PROVIDER_TOOL_DESCRIPTION_LENGTH = 1024;

function getToolDescription(context: string): string {
  const [headerAndDescription = ''] = context.split('\n\n');
  const [, ...descriptionLines] = headerAndDescription.split('\n');

  return descriptionLines.join('\n').trim();
}

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

  it('builds dynamic context from the supplied conversation anchor', () => {
    const context = buildWebSearchDynamicContext('2024-01-02T03:04:05.000Z');
    const secondContext = buildWebSearchDynamicContext('2024-01-02T03:04:05.000Z');

    expect(context).toBe(
      '# `web_search` Runtime Context\nConversation Date & Time: 2024-01-02T03:04:05.000Z',
    );
    expect(secondContext).toBe(context);
  });

  it('keeps provider-facing tool description within common API limits', () => {
    const description = getToolDescription(buildWebSearchContext());

    expect(description).toContain('search');
    expect(description.length).toBeLessThanOrEqual(MAX_PROVIDER_TOOL_DESCRIPTION_LENGTH);
  });
});
