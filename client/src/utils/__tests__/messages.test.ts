import type { TMessage } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';
import { getMessageAriaLabel, getHeaderPrefixForScreenReader } from '../messages';

const translations: Record<string, string> = {
  com_endpoint_message: 'Message',
  com_endpoint_message_new: 'Message {{0}}',
  com_ui_prompt: 'Prompt',
  com_ui_response: 'Response',
};

const localize: LocalizeFunction = ((key: string, args?: Record<string, string | number>) => {
  const template = translations[key] ?? key;
  if (args) {
    return Object.entries(args).reduce(
      (result, [k, v]) => result.replace(`{{${k}}}`, String(v)),
      template,
    );
  }
  return template;
}) as LocalizeFunction;

const makeMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'msg-1',
    isCreatedByUser: false,
    ...overrides,
  }) as TMessage;

describe('getMessageAriaLabel', () => {
  it('returns "Message N" when depth is present and valid', () => {
    const msg = makeMessage({ depth: 2 });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message 3');
  });

  it('returns "Message" when depth is undefined', () => {
    const msg = makeMessage({ depth: undefined });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message');
  });

  it('returns "Message" when depth is negative', () => {
    const msg = makeMessage({ depth: -1 });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message');
  });

  it('returns "Message 1" for depth 0 (root message)', () => {
    const msg = makeMessage({ depth: 0 });
    expect(getMessageAriaLabel(msg, localize)).toBe('Message 1');
  });
});

describe('getHeaderPrefixForScreenReader', () => {
  it('returns "Prompt N: " for user messages with valid depth', () => {
    const msg = makeMessage({ isCreatedByUser: true, depth: 2 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Prompt 3: ');
  });

  it('returns "Response N: " for AI messages with valid depth', () => {
    const msg = makeMessage({ isCreatedByUser: false, depth: 0 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Response 1: ');
  });

  it('returns "Prompt: " for user messages without depth', () => {
    const msg = makeMessage({ isCreatedByUser: true, depth: undefined });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Prompt: ');
  });

  it('returns "Response: " for AI messages without depth', () => {
    const msg = makeMessage({ isCreatedByUser: false, depth: undefined });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Response: ');
  });

  it('omits number when depth is -1 (no "Prompt 0:" regression)', () => {
    const msg = makeMessage({ isCreatedByUser: true, depth: -1 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Prompt: ');
  });

  it('omits number when depth is negative', () => {
    const msg = makeMessage({ isCreatedByUser: false, depth: -5 });
    expect(getHeaderPrefixForScreenReader(msg, localize)).toBe('Response: ');
  });
});
