import { replaceSpecialVars, parseConvo, parseCompactConvo, parseTextParts } from '../src/parsers';
import { specialVariables } from '../src/config';
import { EModelEndpoint } from '../src/schemas';
import { ContentTypes } from '../src/types/runs';
import type { TMessageContentParts } from '../src/types/assistants';
import type { TUser, TConversation } from '../src/types';

// Mock dayjs module with consistent date/time values regardless of environment
jest.mock('dayjs', () => {
  // Create a mock implementation that returns fixed values
  const mockDayjs = () => ({
    format: (format: string) => {
      if (format === 'YYYY-MM-DD') {
        return '2024-04-29';
      }
      if (format === 'YYYY-MM-DD HH:mm:ss') {
        return '2024-04-29 12:34:56';
      }
      return format; // fallback
    },
    day: () => 1, // 1 = Monday
    toISOString: () => '2024-04-29T16:34:56.000Z',
  });

  // Add any static methods needed
  mockDayjs.extend = jest.fn();

  return mockDayjs;
});

describe('replaceSpecialVars', () => {
  // Create a partial user object for testing
  const mockUser = {
    name: 'Test User',
    id: 'user123',
  } as TUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return the original text if text is empty', () => {
    expect(replaceSpecialVars({ text: '' })).toBe('');
    expect(replaceSpecialVars({ text: null as unknown as string })).toBe(null);
    expect(replaceSpecialVars({ text: undefined as unknown as string })).toBe(undefined);
  });

  test('should replace {{current_date}} with the current date', () => {
    const result = replaceSpecialVars({ text: 'Today is {{current_date}}' });
    // dayjs().day() returns 1 for Monday (April 29, 2024 is a Monday)
    expect(result).toBe('Today is 2024-04-29 (1)');
  });

  test('should replace {{current_datetime}} with the current datetime', () => {
    const result = replaceSpecialVars({ text: 'Now is {{current_datetime}}' });
    expect(result).toBe('Now is 2024-04-29 12:34:56 (1)');
  });

  test('should replace {{iso_datetime}} with the ISO datetime', () => {
    const result = replaceSpecialVars({ text: 'ISO time: {{iso_datetime}}' });
    expect(result).toBe('ISO time: 2024-04-29T16:34:56.000Z');
  });

  test('should replace {{current_user}} with the user name if provided', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}!',
      user: mockUser,
    });
    expect(result).toBe('Hello Test User!');
  });

  test('should not replace {{current_user}} if user is not provided', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}!',
    });
    expect(result).toBe('Hello {{current_user}}!');
  });

  test('should not replace {{current_user}} if user has no name', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}!',
      user: { id: 'user123' } as TUser,
    });
    expect(result).toBe('Hello {{current_user}}!');
  });

  test('should handle multiple replacements in the same text', () => {
    const result = replaceSpecialVars({
      text: 'Hello {{current_user}}! Today is {{current_date}} and the time is {{current_datetime}}. ISO: {{iso_datetime}}',
      user: mockUser,
    });
    expect(result).toBe(
      'Hello Test User! Today is 2024-04-29 (1) and the time is 2024-04-29 12:34:56 (1). ISO: 2024-04-29T16:34:56.000Z',
    );
  });

  test('should be case-insensitive when replacing variables', () => {
    const result = replaceSpecialVars({
      text: 'Date: {{CURRENT_DATE}}, User: {{Current_User}}',
      user: mockUser,
    });
    expect(result).toBe('Date: 2024-04-29 (1), User: Test User');
  });

  test('should confirm all specialVariables from config.ts get parsed', () => {
    // Create a text that includes all special variables
    const specialVarsText = Object.keys(specialVariables)
      .map((key) => `{{${key}}}`)
      .join(' ');

    const result = replaceSpecialVars({
      text: specialVarsText,
      user: mockUser,
    });

    // Verify none of the original variable placeholders remain in the result
    Object.keys(specialVariables).forEach((key) => {
      const placeholder = `{{${key}}}`;
      expect(result).not.toContain(placeholder);
    });

    // Verify the expected replacements
    expect(result).toContain('2024-04-29 (1)'); // current_date
    expect(result).toContain('2024-04-29 12:34:56 (1)'); // current_datetime
    expect(result).toContain('2024-04-29T16:34:56.000Z'); // iso_datetime
    expect(result).toContain('Test User'); // current_user
  });
});

describe('parseCompactConvo', () => {
  describe('iconURL security sanitization', () => {
    test('should strip iconURL from OpenAI endpoint conversation input', () => {
      const maliciousIconURL = 'https://evil-tracker.example.com/pixel.png?user=victim';
      const conversation: Partial<TConversation> = {
        model: 'gpt-4',
        iconURL: maliciousIconURL,
        endpoint: EModelEndpoint.openAI,
      };

      const result = parseCompactConvo({
        endpoint: EModelEndpoint.openAI,
        conversation,
      });

      expect(result).not.toBeNull();
      expect(result?.['iconURL']).toBeUndefined();
      expect(result?.model).toBe('gpt-4');
    });

    test('should strip iconURL from agents endpoint conversation input', () => {
      const maliciousIconURL = 'https://evil-tracker.example.com/pixel.png';
      const conversation: Partial<TConversation> = {
        agent_id: 'agent_123',
        iconURL: maliciousIconURL,
        endpoint: EModelEndpoint.agents,
      };

      const result = parseCompactConvo({
        endpoint: EModelEndpoint.agents,
        conversation,
      });

      expect(result).not.toBeNull();
      expect(result?.['iconURL']).toBeUndefined();
      expect(result?.agent_id).toBe('agent_123');
    });

    test('should strip iconURL from anthropic endpoint conversation input', () => {
      const maliciousIconURL = 'https://tracker.malicious.com/beacon.gif';
      const conversation: Partial<TConversation> = {
        model: 'claude-3-opus',
        iconURL: maliciousIconURL,
        endpoint: EModelEndpoint.anthropic,
      };

      const result = parseCompactConvo({
        endpoint: EModelEndpoint.anthropic,
        conversation,
      });

      expect(result).not.toBeNull();
      expect(result?.['iconURL']).toBeUndefined();
      expect(result?.model).toBe('claude-3-opus');
    });

    test('should strip iconURL from google endpoint conversation input', () => {
      const maliciousIconURL = 'https://tracking.example.com/spy.png';
      const conversation: Partial<TConversation> = {
        model: 'gemini-pro',
        iconURL: maliciousIconURL,
        endpoint: EModelEndpoint.google,
      };

      const result = parseCompactConvo({
        endpoint: EModelEndpoint.google,
        conversation,
      });

      expect(result).not.toBeNull();
      expect(result?.['iconURL']).toBeUndefined();
      expect(result?.model).toBe('gemini-pro');
    });

    test('should strip iconURL from assistants endpoint conversation input', () => {
      const maliciousIconURL = 'https://evil.com/track.png';
      const conversation: Partial<TConversation> = {
        assistant_id: 'asst_123',
        iconURL: maliciousIconURL,
        endpoint: EModelEndpoint.assistants,
      };

      const result = parseCompactConvo({
        endpoint: EModelEndpoint.assistants,
        conversation,
      });

      expect(result).not.toBeNull();
      expect(result?.['iconURL']).toBeUndefined();
      expect(result?.assistant_id).toBe('asst_123');
    });

    test('should preserve other conversation properties while stripping iconURL', () => {
      const conversation: Partial<TConversation> = {
        model: 'gpt-4',
        iconURL: 'https://malicious.com/track.png',
        endpoint: EModelEndpoint.openAI,
        temperature: 0.7,
        top_p: 0.9,
        promptPrefix: 'You are a helpful assistant.',
        maxContextTokens: 4000,
      };

      const result = parseCompactConvo({
        endpoint: EModelEndpoint.openAI,
        conversation,
      });

      expect(result).not.toBeNull();
      expect(result?.['iconURL']).toBeUndefined();
      expect(result?.model).toBe('gpt-4');
      expect(result?.temperature).toBe(0.7);
      expect(result?.top_p).toBe(0.9);
      expect(result?.promptPrefix).toBe('You are a helpful assistant.');
      expect(result?.maxContextTokens).toBe(4000);
    });

    test('should handle conversation without iconURL (no error)', () => {
      const conversation: Partial<TConversation> = {
        model: 'gpt-4',
        endpoint: EModelEndpoint.openAI,
      };

      const result = parseCompactConvo({
        endpoint: EModelEndpoint.openAI,
        conversation,
      });

      expect(result).not.toBeNull();
      expect(result?.['iconURL']).toBeUndefined();
      expect(result?.model).toBe('gpt-4');
    });
  });
});

describe('parseConvo - defaultParamsEndpoint', () => {
  test('should strip maxOutputTokens for custom endpoint without defaultParamsEndpoint', () => {
    const conversation: Partial<TConversation> = {
      model: 'anthropic/claude-opus-4.5',
      temperature: 0.7,
      maxOutputTokens: 8192,
      maxContextTokens: 50000,
    };

    const result = parseConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
    });

    expect(result).not.toBeNull();
    expect(result?.temperature).toBe(0.7);
    expect(result?.maxContextTokens).toBe(50000);
    expect(result?.maxOutputTokens).toBeUndefined();
  });

  test('should preserve maxOutputTokens when defaultParamsEndpoint is anthropic', () => {
    const conversation: Partial<TConversation> = {
      model: 'anthropic/claude-opus-4.5',
      temperature: 0.7,
      maxOutputTokens: 8192,
      topP: 0.9,
      topK: 40,
      maxContextTokens: 50000,
    };

    const result = parseConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
      defaultParamsEndpoint: EModelEndpoint.anthropic,
    });

    expect(result).not.toBeNull();
    expect(result?.model).toBe('anthropic/claude-opus-4.5');
    expect(result?.temperature).toBe(0.7);
    expect(result?.maxOutputTokens).toBe(8192);
    expect(result?.topP).toBe(0.9);
    expect(result?.topK).toBe(40);
    expect(result?.maxContextTokens).toBe(50000);
  });

  test('should strip OpenAI-specific fields when defaultParamsEndpoint is anthropic', () => {
    const conversation: Partial<TConversation> = {
      model: 'anthropic/claude-opus-4.5',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
      presence_penalty: 0.5,
      frequency_penalty: 0.3,
    };

    const result = parseConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
      defaultParamsEndpoint: EModelEndpoint.anthropic,
    });

    expect(result).not.toBeNull();
    expect(result?.temperature).toBe(0.7);
    expect(result?.max_tokens).toBeUndefined();
    expect(result?.top_p).toBeUndefined();
    expect(result?.presence_penalty).toBeUndefined();
    expect(result?.frequency_penalty).toBeUndefined();
  });

  test('should preserve max_tokens when defaultParamsEndpoint is not set (OpenAI default)', () => {
    const conversation: Partial<TConversation> = {
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
    };

    const result = parseConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
    });

    expect(result).not.toBeNull();
    expect(result?.max_tokens).toBe(4096);
    expect(result?.top_p).toBe(0.9);
  });

  test('should preserve Google-specific fields when defaultParamsEndpoint is google', () => {
    const conversation: Partial<TConversation> = {
      model: 'gemini-pro',
      temperature: 0.7,
      maxOutputTokens: 8192,
      topP: 0.9,
      topK: 40,
    };

    const result = parseConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
      defaultParamsEndpoint: EModelEndpoint.google,
    });

    expect(result).not.toBeNull();
    expect(result?.maxOutputTokens).toBe(8192);
    expect(result?.topP).toBe(0.9);
    expect(result?.topK).toBe(40);
  });

  test('should not strip fields from non-custom endpoints that already have a schema', () => {
    const conversation: Partial<TConversation> = {
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
    };

    const result = parseConvo({
      endpoint: EModelEndpoint.openAI,
      conversation,
      defaultParamsEndpoint: EModelEndpoint.anthropic,
    });

    expect(result).not.toBeNull();
    expect(result?.max_tokens).toBe(4096);
    expect(result?.top_p).toBe(0.9);
  });

  test('should not carry bedrock region to custom endpoint without defaultParamsEndpoint', () => {
    const conversation: Partial<TConversation> = {
      model: 'gpt-4o',
      temperature: 0.7,
      region: 'us-east-1',
    };

    const result = parseConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
    });

    expect(result).not.toBeNull();
    expect(result?.temperature).toBe(0.7);
    expect(result?.region).toBeUndefined();
  });

  test('should fall back to endpointType schema when defaultParamsEndpoint is invalid', () => {
    const conversation: Partial<TConversation> = {
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 4096,
      maxOutputTokens: 8192,
    };

    const result = parseConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
      defaultParamsEndpoint: 'nonexistent_endpoint',
    });

    expect(result).not.toBeNull();
    expect(result?.max_tokens).toBe(4096);
    expect(result?.maxOutputTokens).toBeUndefined();
  });
});

describe('parseCompactConvo - defaultParamsEndpoint', () => {
  test('should strip maxOutputTokens for custom endpoint without defaultParamsEndpoint', () => {
    const conversation: Partial<TConversation> = {
      model: 'anthropic/claude-opus-4.5',
      temperature: 0.7,
      maxOutputTokens: 8192,
    };

    const result = parseCompactConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
    });

    expect(result).not.toBeNull();
    expect(result?.temperature).toBe(0.7);
    expect(result?.maxOutputTokens).toBeUndefined();
  });

  test('should preserve maxOutputTokens when defaultParamsEndpoint is anthropic', () => {
    const conversation: Partial<TConversation> = {
      model: 'anthropic/claude-opus-4.5',
      temperature: 0.7,
      maxOutputTokens: 8192,
      topP: 0.9,
      maxContextTokens: 50000,
    };

    const result = parseCompactConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
      defaultParamsEndpoint: EModelEndpoint.anthropic,
    });

    expect(result).not.toBeNull();
    expect(result?.maxOutputTokens).toBe(8192);
    expect(result?.topP).toBe(0.9);
    expect(result?.maxContextTokens).toBe(50000);
  });

  test('should strip iconURL even when defaultParamsEndpoint is set', () => {
    const conversation: Partial<TConversation> = {
      model: 'anthropic/claude-opus-4.5',
      iconURL: 'https://malicious.com/track.png',
      maxOutputTokens: 8192,
    };

    const result = parseCompactConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
      defaultParamsEndpoint: EModelEndpoint.anthropic,
    });

    expect(result).not.toBeNull();
    expect(result?.['iconURL']).toBeUndefined();
    expect(result?.maxOutputTokens).toBe(8192);
  });

  test('should fall back to endpointType when defaultParamsEndpoint is null', () => {
    const conversation: Partial<TConversation> = {
      model: 'gpt-4o',
      max_tokens: 4096,
      maxOutputTokens: 8192,
    };

    const result = parseCompactConvo({
      endpoint: 'MyCustomEndpoint' as EModelEndpoint,
      endpointType: EModelEndpoint.custom,
      conversation,
      defaultParamsEndpoint: null,
    });

    expect(result).not.toBeNull();
    expect(result?.max_tokens).toBe(4096);
    expect(result?.maxOutputTokens).toBeUndefined();
  });
});

describe('parseTextParts', () => {
  test('should concatenate text parts', () => {
    const parts: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: 'Hello' },
      { type: ContentTypes.TEXT, text: 'World' },
    ];
    expect(parseTextParts(parts)).toBe('Hello World');
  });

  test('should handle text parts with object-style text values', () => {
    const parts: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: { value: 'structured text' } },
    ];
    expect(parseTextParts(parts)).toBe('structured text');
  });

  test('should include think parts by default', () => {
    const parts: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: 'Answer:' },
      { type: ContentTypes.THINK, think: 'reasoning step' },
    ];
    expect(parseTextParts(parts)).toBe('Answer: reasoning step');
  });

  test('should skip think parts when skipReasoning is true', () => {
    const parts: TMessageContentParts[] = [
      { type: ContentTypes.THINK, think: 'internal reasoning' },
      { type: ContentTypes.TEXT, text: 'visible answer' },
    ];
    expect(parseTextParts(parts, true)).toBe('visible answer');
  });

  test('should skip non-text/think part types', () => {
    const parts: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: 'before' },
      { type: ContentTypes.IMAGE_FILE } as TMessageContentParts,
      { type: ContentTypes.TEXT, text: 'after' },
    ];
    expect(parseTextParts(parts)).toBe('before after');
  });

  test('should handle undefined elements in the content parts array', () => {
    const parts: Array<TMessageContentParts | undefined> = [
      { type: ContentTypes.TEXT, text: 'first' },
      undefined,
      { type: ContentTypes.TEXT, text: 'third' },
    ];
    expect(parseTextParts(parts)).toBe('first third');
  });

  test('should handle multiple consecutive undefined elements', () => {
    const parts: Array<TMessageContentParts | undefined> = [
      undefined,
      undefined,
      { type: ContentTypes.TEXT, text: 'only text' },
      undefined,
    ];
    expect(parseTextParts(parts)).toBe('only text');
  });

  test('should handle an array of all undefined elements', () => {
    const parts: Array<TMessageContentParts | undefined> = [undefined, undefined, undefined];
    expect(parseTextParts(parts)).toBe('');
  });

  test('should handle parts with missing type property', () => {
    const parts: Array<TMessageContentParts | undefined> = [
      { text: 'no type field' } as unknown as TMessageContentParts,
      { type: ContentTypes.TEXT, text: 'valid' },
    ];
    expect(parseTextParts(parts)).toBe('valid');
  });

  test('should return empty string for empty array', () => {
    expect(parseTextParts([])).toBe('');
  });

  test('should not add extra spaces when parts already have spacing', () => {
    const parts: TMessageContentParts[] = [
      { type: ContentTypes.TEXT, text: 'Hello ' },
      { type: ContentTypes.TEXT, text: 'World' },
    ];
    expect(parseTextParts(parts)).toBe('Hello World');
  });
});
