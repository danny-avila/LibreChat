import { formatToolContent } from '../parsers';
import type * as t from '../types';

/**
 * Tools that declare an `outputSchema` may return their payload in
 * `structuredContent` (MCP spec revision 2025-06-18). The spec says servers
 * SHOULD also mirror it into a text content block, but that is a SHOULD —
 * a server may legitimately send `structuredContent` with no `content`.
 *
 * The SDK's CallToolResult schema defaults a missing `content` to `[]`, so
 * without a fallback such a result is indistinguishable from an empty one.
 */
const structuredOnlyResult = {
  content: [],
  structuredContent: {
    items: [{ id: 'item-1', name: 'Example', permissionLevel: 'create' }],
  },
  isError: false,
} as unknown as t.MCPToolCallResponse;

describe('structuredContent fallback', () => {
  it('renders structuredContent when content is empty', () => {
    const [text] = formatToolContent(structuredOnlyResult, 'anthropic' as t.Provider);
    expect(text).toContain('item-1');
    expect(text).not.toBe('(No response)');
  });

  it('still returns (No response) when there is genuinely nothing', () => {
    const [text] = formatToolContent(
      { content: [] } as t.MCPToolCallResponse,
      'anthropic' as t.Provider,
    );
    expect(text).toBe('(No response)');
  });

  it('ignores empty structuredContent objects', () => {
    const [text] = formatToolContent(
      { content: [], structuredContent: {} } as unknown as t.MCPToolCallResponse,
      'anthropic' as t.Provider,
    );
    expect(text).toBe('(No response)');
  });

  it('prefers text content when both are present, leaving existing servers unaffected', () => {
    const [text] = formatToolContent(
      {
        content: [{ type: 'text', text: 'hello' }],
        structuredContent: { a: 1 },
      } as unknown as t.MCPToolCallResponse,
      'anthropic' as t.Provider,
    );
    expect(text).toBe('hello');
  });
});
