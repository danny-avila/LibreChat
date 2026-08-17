import { startTransition, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { kickDrawerAnimation } from './useDrawerSwipe';
import store from '~/store';

/**
 * The one path every sidebar open/close mutation takes. On mobile the drawer
 * slide starts imperatively (see kickDrawerAnimation) and the Recoil flip is
 * deferred past the first frames, so the commit — hundreds of ms on a large
 * conversation — cannot delay first motion. Setting the atom directly
 * reintroduces exactly that stall, which is why conversation selection and
 * the keyboard shortcuts route through here too, not just the toggle
 * buttons. On desktop the flip applies immediately and the width transition
 * animates as before.
 *
 * Returns whether the drawer animator handled the slide, so callers can keep
 * non-drawer affordances (like the desktop focus timer) off the animated
 * path.
 */
export default function useSidebarToggle(): (next: boolean) => boolean {
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  return useCallback(
    (next: boolean) =>
      kickDrawerAnimation(next, () => {
        startTransition(() => {
          setSidebarExpanded(next);
        });
      }),
    [setSidebarExpanded],
  );
}
