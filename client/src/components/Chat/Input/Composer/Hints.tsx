import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import type { ComposerHintState } from '~/hooks/Input/useComposerHint';
import useComposerHint from '~/hooks/Input/useComposerHint';
import store from '~/store';

export const COMPOSER_HINT_ID = 'composer-hint';

/**
 * The dim line under the composer carrying whatever the current state affords —
 * most importantly the during-run modifiers (`⌘⏎` queue, `⌥⏎` interrupt & send),
 * which had no on-screen presence at all before.
 *
 * Ambient tips are opt-in and off by default: they are discovery copy, and the
 * row they sit on costs the thread height on every turn. Live state (uploads, a
 * paused question, the during-run modifiers) reports itself either way — those
 * are things happening now, not things worth teaching.
 *
 * The visible line is `aria-hidden`; the same string is mirrored into a
 * visually-hidden node that the textarea points at via `aria-describedby`, which
 * is why hiding the line costs a screen reader nothing. An `aria-live` region
 * here would re-announce on every keystroke as the hint flips between idle and
 * typing, so the description channel carries it instead.
 */
function Hints(state: Omit<ComposerHintState, 'enterToSend'>) {
  const enterToSend = useRecoilValue(store.enterToSend);
  const hint = useComposerHint({ ...state, enterToSend });
  const showTips = useRecoilValue(store.showComposerTips);
  const visible = showTips || hint.kind === 'state';

  return (
    <>
      {visible && (
        <div
          aria-hidden="true"
          data-testid="composer-hints"
          className="pointer-events-none select-none px-3 pt-1.5 text-center text-[11px] leading-4 text-text-secondary"
        >
          {hint.text}
        </div>
      )}
      <span id={COMPOSER_HINT_ID} className="sr-only">
        {hint.text}
      </span>
    </>
  );
}

export default memo(Hints);
