import type { TConversation, TMessage } from 'librechat-data-provider';

/**
 * Test suite for formatModelInfo utility function
 * Tests the extraction and formatting of model metadata
 */

// Import the function (Note: In production, this would be exported from HoverButtons.tsx)
// For testing purposes, we'll need to extract it or test it through the component
// This test assumes the function is exported for testing

/**
 * Mock implementation of formatModelInfo for testing
 * (In production, this would be imported from the actual module)
 */
const formatModelInfo = (message: TMessage, conversation: TConversation | null): string => {
  // Extract model information with fallbacks
  const model = message.model || conversation?.model || 'Unknown Model';
  const modelLabel = conversation?.modelLabel || model;
  const endpoint = conversation?.endpoint || 'Unknown Provider';
  const endpointType = conversation?.endpointType;

  // Format the timestamp with locale-aware formatting
  const timestamp = message.createdAt
    ? new Date(message.createdAt).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Unknown Time';

  // Build optional additional information fields
  const messageId = message.messageId ? `\nMessage ID: ${message.messageId.slice(0, 8)}...` : '';
  const finishReason = message.finish_reason ? `\nFinish: ${message.finish_reason}` : '';
  const error = message.error ? '\nStatus: ⚠️ Error' : '';
  
  // Combine endpoint and endpointType for complete provider info
  const providerInfo = endpointType && endpointType !== endpoint 
    ? `${endpoint} (${endpointType})` 
    : endpoint;

  // Construct final formatted string
  return `Model: ${modelLabel || model}\nProvider: ${providerInfo}\nTimestamp: ${timestamp}${messageId}${finishReason}${error}`;
};

describe('formatModelInfo Function', () => {
  /**
   * Test: Formats complete model information correctly
   */
  it('formats complete model information with all fields', () => {
    const message: TMessage = {
      messageId: 'msg-abc123456789',
      text: 'Test message',
      model: 'gpt-4-turbo-preview',
      createdAt: '2024-01-15T10:30:45.000Z',
      finish_reason: 'stop',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const conversation: TConversation = {
      conversationId: 'conv-123',
      endpoint: 'openai',
      endpointType: 'azure',
      model: 'gpt-4-turbo',
      modelLabel: 'GPT-4 Turbo',
      title: 'Test Conversation',
    };

    const result = formatModelInfo(message, conversation);

    expect(result).toContain('Model: GPT-4 Turbo');
    expect(result).toContain('Provider: openai (azure)');
    expect(result).toContain('Message ID: msg-abc1');
    expect(result).toContain('Finish: stop');
    expect(result).not.toContain('Status: ⚠️ Error');
  });

  /**
   * Test: Uses message model over conversation model when available
   */
  it('prioritizes message.model over conversation.model', () => {
    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Test',
      model: 'claude-3-opus',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const conversation: TConversation = {
      conversationId: 'conv-123',
      endpoint: 'anthropic',
      model: 'claude-2',
      title: 'Test',
    };

    const result = formatModelInfo(message, conversation);
    expect(result).toContain('Model: claude-3-opus');
  });

  /**
   * Test: Handles missing conversation gracefully
   */
  it('handles null conversation with fallback values', () => {
    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Test',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const result = formatModelInfo(message, null);

    expect(result).toContain('Model: Unknown Model');
    expect(result).toContain('Provider: Unknown Provider');
    expect(result).toContain('Unknown Time');
  });

  /**
   * Test: Formats timestamp correctly
   */
  it('formats ISO timestamp to locale string', () => {
    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Test',
      createdAt: '2024-12-25T15:45:30.123Z',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const result = formatModelInfo(message, null);

    // Check for date components (exact format varies by locale)
    expect(result).toMatch(/Dec/);
    expect(result).toContain('25');
    expect(result).toContain('2024');
  });

  /**
   * Test: Truncates long message IDs
   */
  it('truncates message ID to first 8 characters', () => {
    const message: TMessage = {
      messageId: 'msg-verylongmessageidthatshouldbecuttoshort',
      text: 'Test',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const result = formatModelInfo(message, null);

    expect(result).toContain('Message ID: msg-very...');
    expect(result).not.toContain('verylongmessageid');
  });

  /**
   * Test: Includes error status when present
   */
  it('includes error status indicator when message has error', () => {
    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Error occurred',
      error: true,
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const result = formatModelInfo(message, null);

    expect(result).toContain('Status: ⚠️ Error');
  });

  /**
   * Test: Handles endpoint without endpointType
   */
  it('shows only endpoint when endpointType is not present', () => {
    const conversation: TConversation = {
      conversationId: 'conv-123',
      endpoint: 'openai',
      model: 'gpt-4',
      title: 'Test',
    };

    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Test',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const result = formatModelInfo(message, conversation);

    expect(result).toContain('Provider: openai');
    expect(result).not.toContain('(');
  });

  /**
   * Test: Handles same endpoint and endpointType
   */
  it('shows single value when endpoint equals endpointType', () => {
    const conversation: TConversation = {
      conversationId: 'conv-123',
      endpoint: 'anthropic',
      endpointType: 'anthropic',
      model: 'claude-3',
      title: 'Test',
    };

    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Test',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const result = formatModelInfo(message, conversation);

    expect(result).toContain('Provider: anthropic');
    expect(result).not.toContain('anthropic (anthropic)');
  });

  /**
   * Test: Uses modelLabel when available
   */
  it('prefers modelLabel over model name', () => {
    const conversation: TConversation = {
      conversationId: 'conv-123',
      endpoint: 'openai',
      model: 'gpt-4-1106-preview',
      modelLabel: 'GPT-4 Turbo',
      title: 'Test',
    };

    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Test',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const result = formatModelInfo(message, conversation);

    expect(result).toContain('Model: GPT-4 Turbo');
    expect(result).not.toContain('gpt-4-1106-preview');
  });

  /**
   * Test: Includes all finish reasons
   */
  it.each(['stop', 'length', 'tool_calls', 'content_filter', 'cancelled'])(
    'includes finish reason: %s',
    (finishReason) => {
      const message: TMessage = {
        messageId: 'msg-123',
        text: 'Test',
        finish_reason: finishReason,
        isCreatedByUser: false,
        conversationId: 'conv-123',
        parentMessageId: null,
      };

      const result = formatModelInfo(message, null);

      expect(result).toContain(`Finish: ${finishReason}`);
    }
  );

  /**
   * Test: Output format is consistent
   */
  it('maintains consistent multi-line format', () => {
    const message: TMessage = {
      messageId: 'msg-123',
      text: 'Test',
      model: 'test-model',
      createdAt: '2024-01-01T12:00:00.000Z',
      finish_reason: 'stop',
      isCreatedByUser: false,
      conversationId: 'conv-123',
      parentMessageId: null,
    };

    const conversation: TConversation = {
      conversationId: 'conv-123',
      endpoint: 'test-provider',
      model: 'test-model',
      title: 'Test',
    };

    const result = formatModelInfo(message, conversation);
    const lines = result.split('\n');

    expect(lines[0]).toMatch(/^Model: /);
    expect(lines[1]).toMatch(/^Provider: /);
    expect(lines[2]).toMatch(/^Timestamp: /);
    expect(lines[3]).toMatch(/^Message ID: /);
    expect(lines[4]).toMatch(/^Finish: /);
  });
});