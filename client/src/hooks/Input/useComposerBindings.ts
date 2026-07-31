import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import type { ShortcutActionId } from '~/hooks/useKeyboardShortcuts';
import type { ShortcutBinding } from '~/utils/shortcuts';
import { EDITING_ALLOWED_SHORTCUTS, resolveShortcutBindings } from '~/hooks/useKeyboardShortcuts';
import { bindingHash } from '~/utils/shortcuts';
import store from '~/store';

export type ComposerBindings = {
  /**
   * Effective `submitMessage` override: `undefined` when unset (default Ctrl/Cmd+Enter applies),
   * `null` when explicitly unbound, otherwise the rebound chord.
   */
  submitOverride: ShortcutBinding | null | undefined;
  /**
   * Chords the user has bound to global shortcuts that still run while typing
   * (`EDITING_ALLOWED_SHORTCUTS`). The document-level handler in
   * `useKeyboardShortcuts` runs AFTER the composer's and does not check
   * `defaultPrevented`, so the composer must leave these chords entirely to it
   * — acting on them too would fire both. `submitMessage` is excluded: its
   * rebinding is resolved through `submitOverride` instead. No default binding
   * uses an Enter chord besides submit, so this only ever yields to a
   * deliberate rebinding.
   */
  yieldedChords: ReadonlySet<string>;
};

/** The user's effective composer-relevant shortcut bindings, shared by the
 * composer keydown handler and the during-run hovercard hints. */
export default function useComposerBindings(): ComposerBindings {
  const customShortcuts = useRecoilValue(store.customShortcuts);
  const resolvedBindings = useMemo(
    () => resolveShortcutBindings(customShortcuts),
    [customShortcuts],
  );

  const submitOverride = useMemo(() => {
    const override = customShortcuts['submitMessage'];
    if (!override) {
      return resolvedBindings.get('submitMessage') == null ? null : undefined;
    }
    return resolvedBindings.get('submitMessage') ?? null;
  }, [customShortcuts, resolvedBindings]);

  const yieldedChords = useMemo(() => {
    const editingAllowed: ReadonlySet<string> = EDITING_ALLOWED_SHORTCUTS;
    const hashes = new Set<string>();
    for (const actionId of editingAllowed) {
      if (actionId === 'submitMessage') {
        continue;
      }
      const binding = resolvedBindings.get(actionId as ShortcutActionId);
      if (binding) {
        hashes.add(bindingHash(binding));
      }
    }
    return hashes;
  }, [resolvedBindings]);

  return useMemo(() => ({ submitOverride, yieldedChords }), [submitOverride, yieldedChords]);
}
