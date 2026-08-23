import { useMediaQuery, useRemScale } from '@librechat/client';
import { drawerMediaQuery } from '~/utils/drawer';

/**
 * Whether navigation is in drawer mode, measured in the units the sidebar is laid out
 * in. Shared by the hook that owns the open state and by every route control that
 * reveals the reopen affordance, so they cannot disagree about the current mode.
 */
export default function useDrawerViewport(): boolean {
  const remScale = useRemScale();
  return useMediaQuery(drawerMediaQuery(remScale));
}
