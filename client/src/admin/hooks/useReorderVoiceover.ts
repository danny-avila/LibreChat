import { useMemo } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';

/**
 * Returns a localized `voiceover` config object for react-movable's `<List>`.
 */
export function useReorderVoiceover(): t.ReorderVoiceover {
  const localize = useLocalize();

  return useMemo(
    () => ({
      item: (position: number) => localize('com_admin_access_reorder_item', { position }),
      lifted: (position: number) => localize('com_admin_access_reorder_lifted', { position }),
      moved: (position: number, up: boolean) =>
        localize('com_admin_access_reorder_moved', { position, direction: up ? 'up' : 'down' }),
      dropped: (from: number, to: number) =>
        localize('com_admin_access_reorder_dropped', { from, to }),
      canceled: (position: number) => localize('com_admin_access_reorder_canceled', { position }),
    }),
    [localize],
  );
}
