import { EModelEndpoint } from '../src';
import createPayload from '../src/createPayload';
import type { TSubmission } from '../src/types';

describe('createPayload', () => {
  it('includes mcpAppModelContext when present', () => {
    const submission = {
      userMessage: {
        text: 'hello',
        messageId: 'user-1',
        parentMessageId: 'parent-1',
        conversationId: 'convo-1',
      },
      isTemporary: false,
      isContinued: false,
      messages: [],
      conversation: {
        conversationId: 'convo-1',
        endpoint: EModelEndpoint.openAI,
      },
      endpointOption: {
        endpoint: EModelEndpoint.openAI,
      },
      mcpAppModelContext: {
        content: [{ type: 'text', text: 'context from app' }],
        structuredContent: { source: 'app' },
      },
    } as unknown as TSubmission;

    const { payload } = createPayload(submission);
    expect(payload.mcpAppModelContext).toEqual({
      content: [{ type: 'text', text: 'context from app' }],
      structuredContent: { source: 'app' },
    });
  });
});
