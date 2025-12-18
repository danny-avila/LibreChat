import { replaceSpecialVars, parseCompactConvo } from '../src/parsers';
import { specialVariables } from '../src/config';
import { EModelEndpoint } from '../src/schemas';
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
      expect(result?.iconURL).toBeUndefined();
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
      expect(result?.iconURL).toBeUndefined();
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
      expect(result?.iconURL).toBeUndefined();
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
      expect(result?.iconURL).toBeUndefined();
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
      expect(result?.iconURL).toBeUndefined();
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
      expect(result?.iconURL).toBeUndefined();
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
      expect(result?.iconURL).toBeUndefined();
      expect(result?.model).toBe('gpt-4');
    });
  });
});
