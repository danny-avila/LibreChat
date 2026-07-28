import type { ComposerHintState } from '../useComposerHint';
import { composeHint } from '../useComposerHint';

/** Echoes the key so assertions read against the key, not English copy. */
const localize = ((key: string, options?: Record<string, string | number>) =>
  options ? `${key}:${options[0] ?? options.count}` : key) as Parameters<typeof composeHint>[1];

const baseState: ComposerHintState = {
  hasText: false,
  isSubmitting: false,
  duringRunActive: false,
  duringRunAction: 'queue' as const,
  answerModeActive: false,
  uploadingCount: 0,
  enterToSend: true,
};

const hint = (overrides: Partial<ComposerHintState>, isMac = true) =>
  composeHint({ ...baseState, ...overrides }, localize, isMac).text;

const kindOf = (overrides: Partial<ComposerHintState>) =>
  composeHint({ ...baseState, ...overrides }, localize, true).kind;

describe('composeHint', () => {
  it('shows discovery affordances on an untouched composer', () => {
    expect(hint({})).toBe('com_ui_composer_hint_idle');
  });

  it('switches to send/newline once there is text', () => {
    expect(hint({ hasText: true })).toBe('com_ui_composer_hint_typing');
  });

  it('offers stop while generating with an empty composer', () => {
    expect(hint({ isSubmitting: true })).toBe('com_ui_composer_hint_stop');
  });

  describe('during a run with text', () => {
    it('leads with queue when queue is the default', () => {
      const result = hint({ duringRunActive: true, hasText: true, isSubmitting: true });
      expect(result).toContain('com_ui_composer_hint_queue_default');
      expect(result).toContain('com_ui_composer_hint_send_now');
      expect(result).toContain('com_ui_composer_hint_interrupt');
    });

    it('leads with steer when the setting is flipped', () => {
      const result = hint({
        duringRunActive: true,
        hasText: true,
        isSubmitting: true,
        duringRunAction: 'steer',
      });
      expect(result).toContain('com_ui_composer_hint_steer');
      expect(result).toContain('com_ui_composer_hint_queue');
      expect(result).toContain('com_ui_composer_hint_interrupt');
    });

    it('uses platform-appropriate modifier glyphs', () => {
      const state = { duringRunActive: true, hasText: true, isSubmitting: true };
      expect(hint(state, true)).toContain('⌘⏎');
      expect(hint(state, true)).toContain('⌥⏎');
      expect(hint(state, false)).toContain('Ctrl+⏎');
      expect(hint(state, false)).toContain('Alt+⏎');
    });

    it('falls back to stop when the modifiers have no text to act on', () => {
      expect(hint({ duringRunActive: true, hasText: false, isSubmitting: true })).toBe(
        'com_ui_composer_hint_stop',
      );
    });
  });

  describe('with Enter bound to a newline', () => {
    it('names the chord as the send key while typing', () => {
      const result = hint({ hasText: true, enterToSend: false });
      expect(result).toContain('⌘⏎');
      expect(result).toContain('com_ui_composer_hint_send');
      expect(result).toContain('com_ui_composer_hint_newline');
      expect(result).not.toContain('com_ui_composer_hint_typing');
    });

    it('drops the alternate during-run action, which the chord no longer reaches', () => {
      const result = hint({
        duringRunActive: true,
        hasText: true,
        isSubmitting: true,
        duringRunAction: 'steer',
        enterToSend: false,
      });
      expect(result).toContain('⌘⏎ com_ui_composer_hint_steer_verb');
      expect(result).toContain('com_ui_composer_hint_interrupt');
      expect(result).not.toContain('com_ui_composer_hint_queue');
    });
  });

  describe('kind', () => {
    it('marks the ambient copy as a tip, so a conversation can drop it', () => {
      expect(kindOf({})).toBe('tip');
      expect(kindOf({ hasText: true })).toBe('tip');
    });

    it('marks anything happening right now as state, which always shows', () => {
      expect(kindOf({ isSubmitting: true })).toBe('state');
      expect(kindOf({ uploadingCount: 1 })).toBe('state');
      expect(kindOf({ answerModeActive: true })).toBe('state');
      expect(kindOf({ duringRunActive: true, hasText: true })).toBe('state');
    });
  });

  describe('precedence', () => {
    it('lets a paused question outrank every other state', () => {
      expect(
        hint({
          answerModeActive: true,
          hasText: true,
          isSubmitting: true,
          duringRunActive: true,
          uploadingCount: 3,
        }),
      ).toBe('com_ui_composer_hint_answer');
    });

    it('reports uploads ahead of the during-run modifiers', () => {
      expect(hint({ uploadingCount: 2, duringRunActive: true, hasText: true })).toBe(
        'com_ui_composer_hint_uploading:2',
      );
      /* One file is one file, not "1 file(s)". */
      expect(hint({ uploadingCount: 1, duringRunActive: true, hasText: true })).toBe(
        'com_ui_composer_hint_uploading_one:1',
      );
    });

    it('stops reporting uploads once they settle', () => {
      expect(hint({ uploadingCount: 0, hasText: true })).toBe('com_ui_composer_hint_typing');
    });
  });
});
