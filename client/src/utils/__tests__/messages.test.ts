import type { TMessage } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';
import {
  getMessageAriaLabel,
  resolveSiblingSelection,
  getHeaderPrefixForScreenReader,
} from '../messages';

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

describe('resolveSiblingSelection', () => {
  it('shows the newest sibling on first sighting of a fork', () => {
    const seen = new Set<string>();
    expect(resolveSiblingSelection(['a', 'b'], seen, null, 0)).toEqual({
      index: 1,
      selectedId: 'b',
    });
  });

  it('focuses a newly added sibling that grew the set (follow-up / new branch)', () => {
    // The fork grew [failed] -> [failed, after] (e.g. a follow-up re-parented as
    // a sibling after a generation-start failure); the new id takes focus even
    // though the prior selection is still present.
    const seen = new Set(['failed']);
    expect(resolveSiblingSelection(['failed', 'after'], seen, 'failed', 1)).toEqual({
      index: 1,
      selectedId: 'after',
    });
  });

  it('focuses a new sibling when the prior selection is gone (regen removed it)', () => {
    // The regenerate slice removes the old response, so its id ('a') is absent
    // and the freshly-streamed sibling ('b') takes focus.
    const seen = new Set(['a']);
    expect(resolveSiblingSelection(['b'], seen, 'a', 1)).toEqual({ index: 0, selectedId: 'b' });
  });

  it('preserves the selected branch when children merely churn (the bug)', () => {
    // both ids already seen, count unchanged — a sibling was transiently dropped
    // and restored while a regeneration elsewhere streamed; keep the user on 'a'
    const seen = new Set(['a', 'b']);
    expect(resolveSiblingSelection(['a', 'b'], seen, 'a', 2)).toEqual({
      index: 0,
      selectedId: 'a',
    });
  });

  it('does not let a placeholder→server id swap steal an explicit selection', () => {
    // User regenerated (in-flight 'a-prelim'), then switched to sibling 'b'; the
    // in-flight id churns to 'a-server' (same count, not growth). Stay on 'b'.
    const seen = new Set(['a-prelim', 'b']);
    expect(resolveSiblingSelection(['b', 'a-server'], seen, 'b', 2)).toEqual({
      index: 0,
      selectedId: 'b',
    });
  });

  it('follows its own placeholder→server id swap when that branch is selected', () => {
    // Viewing the in-flight regen ('a-prelim'); its id churns to 'a-server'.
    const seen = new Set(['a-prelim']);
    expect(resolveSiblingSelection(['a-server'], seen, 'a-prelim', 1)).toEqual({
      index: 0,
      selectedId: 'a-server',
    });
  });

  it('falls back to newest when the selected branch disappears', () => {
    // 'a' (the regenerated-away response) is gone; only seen 'b' remains
    const seen = new Set(['a', 'b']);
    expect(resolveSiblingSelection(['b'], seen, 'a', 2)).toEqual({ index: 0, selectedId: 'b' });
  });

  it('keeps selection across a transient drop then restore', () => {
    const seen = new Set(['a', 'b']);
    // drop: only 'a' present (was 2) → preserved
    expect(resolveSiblingSelection(['a'], seen, 'a', 2)).toEqual({ index: 0, selectedId: 'a' });
    // restore: 'b' returns and the set grew (1 -> 2), but 'b' is already seen so
    // it is not a new sibling → stay on 'a' (now at index 0)
    expect(resolveSiblingSelection(['a', 'b'], seen, 'a', 1)).toEqual({
      index: 0,
      selectedId: 'a',
    });
  });

  it('handles an empty fork', () => {
    expect(resolveSiblingSelection([], new Set(['a']), 'a', 1)).toEqual({
      index: -1,
      selectedId: 'a',
    });
  });
});
