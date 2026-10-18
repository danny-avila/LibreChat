import { useCallback, useEffect, useState } from 'react';
import type * as t from '~/admin/types';
import { scopeParamKey } from '~/admin/utils';
import { useBlocker } from '~/admin/router';

interface BlockerLocation {
  pathname: string;
  search: object;
}

/** `?scope=` of a location, if it is a string. */
function scopeParam(location: BlockerLocation): string | undefined {
  const { search } = location;
  return 'scope' in search && typeof search.scope === 'string' ? search.scope : undefined;
}

function scopeOf(location: BlockerLocation): string | undefined {
  return scopeParamKey(scopeParam(location));
}

/**
 * Holds navigation that would drop unsaved edits — leaving the page, or a
 * profile switch from the selector or Back/Forward — behind the themed guard
 * dialog (WS5: SH-6). "Save & continue" opens the change review and resumes
 * the navigation once the save went through; cancelling the review stays put.
 */
export function useNavigationGuard({
  isDirty,
  discardEdits,
  openReview,
  reviewOpen,
  saving,
  describeScope,
}: t.NavigationGuardOptions): t.NavigationGuardState {
  const shouldBlockFn = useCallback(
    ({ current, next }: { current: BlockerLocation; next: BlockerLocation }) =>
      isDirty && (current.pathname !== next.pathname || scopeOf(current) !== scopeOf(next)),
    [isDirty],
  );
  const enableBeforeUnload = useCallback(() => isDirty, [isDirty]);

  const blocker = useBlocker({ shouldBlockFn, enableBeforeUnload, withResolver: true });
  const [awaitingSave, setAwaitingSave] = useState(false);

  const blocked = blocker.status === 'blocked';
  const { proceed, reset } = blocker;

  useEffect(() => {
    if (!awaitingSave || !blocked) return;
    if (!isDirty) {
      setAwaitingSave(false);
      proceed?.();
      return;
    }
    if (!reviewOpen && !saving) {
      setAwaitingSave(false);
      reset?.();
    }
  }, [awaitingSave, blocked, isDirty, reviewOpen, saving, proceed, reset]);

  const intent: t.NavigationIntent = (() => {
    if (!blocked || !blocker.next) return { kind: 'leave' };
    if (blocker.current && blocker.current.pathname !== blocker.next.pathname) {
      return { kind: 'leave' };
    }
    return { kind: 'scope', name: describeScope(scopeParam(blocker.next)) };
  })();

  return {
    open: blocked && !awaitingSave,
    intent,
    onSave: () => {
      setAwaitingSave(true);
      openReview();
    },
    onDiscard: () => {
      discardEdits();
      proceed?.();
    },
    onCancel: () => reset?.(),
  };
}
