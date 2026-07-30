import { parseBinding, bindingsMatch, resolveSubmitOverrideAction } from '~/utils/shortcuts';

/**
 * The composer's during-run Ctrl/Cmd+Shift+Enter (Interrupt & steer) must yield
 * to a rebound `submitMessage` shortcut only when submit is bound to THAT chord.
 * Yielding to any override at all silently removes the shortcut the hovercard
 * advertises for users who rebound submit to something unrelated.
 */
describe('bindingsMatch', () => {
  const preemptChord = parseBinding('Ctrl+Shift+Enter');

  test('matches the same chord', () => {
    expect(bindingsMatch(preemptChord, parseBinding('Ctrl+Shift+Enter'))).toBe(true);
  });

  test('is insensitive to the order modifiers are written in', () => {
    expect(bindingsMatch(parseBinding('Shift+Ctrl+Enter'), preemptChord)).toBe(true);
  });

  test('does not match a submit shortcut rebound to an unrelated chord', () => {
    expect(bindingsMatch(preemptChord, parseBinding('Ctrl+J'))).toBe(false);
  });

  test('does not match the same key held with different modifiers', () => {
    expect(bindingsMatch(preemptChord, parseBinding('Ctrl+Enter'))).toBe(false);
    expect(bindingsMatch(preemptChord, parseBinding('Cmd+Shift+Enter'))).toBe(false);
  });

  test('treats an explicitly unbound shortcut as no match', () => {
    expect(bindingsMatch(preemptChord, null)).toBe(false);
    expect(bindingsMatch(preemptChord, parseBinding(''))).toBe(false);
  });

  test('treats an unset shortcut as no match', () => {
    expect(bindingsMatch(preemptChord, undefined)).toBe(false);
  });

  test('never matches when no chord was pressed', () => {
    expect(bindingsMatch(null, preemptChord)).toBe(false);
    expect(bindingsMatch(null, null)).toBe(false);
  });
});

describe('resolveSubmitOverrideAction', () => {
  const plainEnter = parseBinding('Enter');

  test('submits on the rebound chord', () => {
    expect(
      resolveSubmitOverrideAction(
        parseBinding('Ctrl+Shift+Enter'),
        parseBinding('Ctrl+Shift+Enter'),
        false,
      ),
    ).toBe('submit');
  });

  test('submits a bare Enter when enterToSend is on', () => {
    expect(resolveSubmitOverrideAction(plainEnter, parseBinding('Ctrl+J'), true)).toBe('submit');
  });

  test('inserts a newline for a bare Enter when enterToSend is off', () => {
    expect(resolveSubmitOverrideAction(plainEnter, parseBinding('Ctrl+J'), false)).toBe('newline');
  });

  test('leaves Shift+Enter and non-Enter keys to the browser', () => {
    expect(resolveSubmitOverrideAction(parseBinding('Shift+Enter'), plainEnter, true)).toBe('none');
    expect(resolveSubmitOverrideAction(parseBinding('Ctrl+J'), parseBinding('Ctrl+J'), true)).toBe(
      'none',
    );
  });

  test('an unbound submit shortcut still allows bare Enter to send', () => {
    expect(resolveSubmitOverrideAction(plainEnter, null, true)).toBe('submit');
    expect(resolveSubmitOverrideAction(plainEnter, null, false)).toBe('newline');
  });
});
