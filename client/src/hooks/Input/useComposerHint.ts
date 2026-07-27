import type { TranslationKeys } from '~/hooks/useLocalize';
import type { LocalizeFunction } from '~/common';
import { isMacPlatform } from '~/utils/shortcuts';
import useLocalize from '~/hooks/useLocalize';

export interface ComposerHintState {
  hasText: boolean;
  isSubmitting: boolean;
  /** Enter steers or queues instead of starting a turn. */
  duringRunActive: boolean;
  /** Which action Enter takes during a run, per the effective setting. */
  duringRunAction: 'steer' | 'queue';
  /** The composer is the answer box for a paused `ask_user_question`. */
  answerModeActive: boolean;
  uploadingCount: number;
}

/**
 * `tip` is ambient discovery copy, true of the composer at all times. `state`
 * reports something happening right now. Only the first is worth permanent
 * space, so the two are distinguished here rather than at the call site.
 */
export type ComposerHintKind = 'tip' | 'state';

export interface ComposerHint {
  text: string;
  kind: ComposerHintKind;
}

const SEPARATOR = ' · ';

/**
 * Resolves the one line shown under the composer. Ordered most-specific first:
 * a paused question owns the composer outright, an in-flight upload is the most
 * urgent transient state, and the during-run modifiers only matter once there
 * is text for them to act on.
 *
 * Exported separately from the hook so the state matrix is testable without
 * rendering.
 */
export function composeHint(
  state: ComposerHintState,
  localize: LocalizeFunction,
  isMac: boolean,
): ComposerHint {
  if (state.answerModeActive) {
    return { text: localize('com_ui_composer_hint_answer'), kind: 'state' };
  }

  if (state.uploadingCount > 0) {
    return {
      text: localize(
        state.uploadingCount === 1
          ? 'com_ui_composer_hint_uploading_one'
          : 'com_ui_composer_hint_uploading',
        { count: state.uploadingCount },
      ),
      kind: 'state',
    };
  }

  if (state.duringRunActive && state.hasText) {
    const mod = isMac ? '⌘⏎' : 'Ctrl+⏎';
    const alt = isMac ? '⌥⏎' : 'Alt+⏎';
    const parts =
      state.duringRunAction === 'steer'
        ? [
            localize('com_ui_composer_hint_steer'),
            `${mod} ${localize('com_ui_composer_hint_queue')}`,
          ]
        : [
            localize('com_ui_composer_hint_queue_default'),
            `${mod} ${localize('com_ui_composer_hint_send_now')}`,
          ];
    return {
      text: [...parts, `${alt} ${localize('com_ui_composer_hint_interrupt')}`].join(SEPARATOR),
      kind: 'state',
    };
  }

  if (state.isSubmitting) {
    return { text: localize('com_ui_composer_hint_stop'), kind: 'state' };
  }

  if (state.hasText) {
    return { text: localize('com_ui_composer_hint_typing'), kind: 'tip' };
  }

  return { text: localize('com_ui_composer_hint_idle'), kind: 'tip' };
}

export default function useComposerHint(state: ComposerHintState): ComposerHint {
  const localize = useLocalize();
  return composeHint(state, localize, isMacPlatform);
}
