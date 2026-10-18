import { useCallback } from 'react';
import type { TranslationKeys } from '~/hooks';
import type * as t from '~/admin/types';
import useAppLocalize from '~/hooks/useLocalize';

/**
 * The admin panel's copy, from SassyChat's translations, where its keys live under
 * `com_admin_`. Some keys are composed at runtime (a section's title, a plural's count), so this
 * accepts any string and lets i18next fall back as SassyChat's own lookups do.
 */
export function useLocalize(): (
  phraseKey: t.TranslationKeys,
  options?: Record<string, string | number>,
) => string {
  const localize = useAppLocalize();

  return useCallback(
    (phraseKey: t.TranslationKeys, options?: Record<string, string | number>) =>
      localize(phraseKey as TranslationKeys, options ?? {}),
    [localize],
  );
}
