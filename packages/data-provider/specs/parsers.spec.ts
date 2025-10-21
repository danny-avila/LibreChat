import { replaceSpecialVars } from '../src/parsers';
import { specialVariables } from '../src/config';
import type { TUser } from '../src/types';

// Mock dayjs module with consistent date/time values regardless of environment
jest.mock('dayjs', () => {
  // Create a mock implementation that returns fixed values
  const mockDayjs = (input?: any) => ({
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
    tz: (timezone: string) => ({
      format: (format: string) => {
        // Mock timezone-specific formatting for America/New_York (UTC-4 during DST)
        if (timezone === 'America/New_York') {
          if (format === 'YYYY-MM-DD') {
            return '2024-04-29';
          }
          if (format === 'YYYY-MM-DD HH:mm:ss') {
            return '2024-04-29 08:34:56'; // 4 hours behind UTC 12:34:56
          }
        }
        // Mock timezone-specific formatting for Asia/Tokyo (UTC+9)
        if (timezone === 'Asia/Tokyo') {
          if (format === 'YYYY-MM-DD') {
            return '2024-04-29';
          }
          if (format === 'YYYY-MM-DD HH:mm:ss') {
            return '2024-04-29 21:34:56'; // 9 hours ahead of UTC 12:34:56
          }
        }
        return format;
      },
      day: () => {
        // Return same day number for simplicity in tests
        return 1;
      },
    }),
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
    // local_date and local_datetime should fall back to UTC when no timezone provided
    expect(result).toContain('2024-04-29 (1)'); // local_date (fallback to UTC)
    expect(result).toContain('2024-04-29 12:34:56 (1)'); // local_datetime (fallback to UTC)
  });

  test('should replace {{local_date}} with the timezone-aware date when timezone is provided', () => {
    const result = replaceSpecialVars({
      text: 'Today in NY is {{local_date}}',
      timezone: 'America/New_York',
    });
    expect(result).toBe('Today in NY is 2024-04-29 (1)');
  });

  test('should replace {{local_datetime}} with the timezone-aware datetime when timezone is provided', () => {
    const result = replaceSpecialVars({
      text: 'Now in NY is {{local_datetime}}',
      timezone: 'America/New_York',
    });
    expect(result).toBe('Now in NY is 2024-04-29 08:34:56 (1)');
  });

  test('should replace {{local_datetime}} with Tokyo timezone', () => {
    const result = replaceSpecialVars({
      text: 'Now in Tokyo is {{local_datetime}}',
      timezone: 'Asia/Tokyo',
    });
    expect(result).toBe('Now in Tokyo is 2024-04-29 21:34:56 (1)');
  });

  test('should fall back to UTC for local variables when no timezone is provided', () => {
    const result = replaceSpecialVars({
      text: 'Date: {{local_date}}, Time: {{local_datetime}}',
    });
    expect(result).toBe('Date: 2024-04-29 (1), Time: 2024-04-29 12:34:56 (1)');
  });

  test('should handle both UTC and local timezone variables in the same text', () => {
    const result = replaceSpecialVars({
      text: 'UTC: {{current_datetime}}, Local: {{local_datetime}}',
      timezone: 'America/New_York',
    });
    expect(result).toBe('UTC: 2024-04-29 12:34:56 (1), Local: 2024-04-29 08:34:56 (1)');
  });

  test('should be case-insensitive for local timezone variables', () => {
    const result = replaceSpecialVars({
      text: 'Date: {{LOCAL_DATE}}, Time: {{Local_DateTime}}',
      timezone: 'America/New_York',
    });
    expect(result).toBe('Date: 2024-04-29 (1), Time: 2024-04-29 08:34:56 (1)');
  });
});
