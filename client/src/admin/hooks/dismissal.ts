import { useCallback, useState } from 'react';
import type * as t from '~/admin/types';

const STORAGE_PREFIX = 'librechat-admin:dismissed:';

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

/**
 * Dismissal of a banner that stays dismissed across visits (VS-10). Storage
 * can be unavailable (private mode, blocked site data); dismissal then lasts
 * until the banner unmounts. Without a key nothing is persisted.
 */
export function useDismissal(key?: string): t.BannerDismissal {
  const [dismissed, setDismissed] = useState(() => (key ? readDismissed(key) : false));
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setDismissed(key ? readDismissed(key) : false);
  }

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (!key) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + key, '1');
    } catch {
      return;
    }
  }, [key]);

  return { dismissed, dismiss };
}
