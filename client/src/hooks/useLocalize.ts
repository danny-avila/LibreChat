import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';
import store from '~/store';

export default function useLocalize() {
  const lang = useRecoilValue(store.lang);

  const memoizedLocalize = useCallback(
    (phraseKey: string, ...values: string[]) => localize(lang, phraseKey, ...(values ?? [])),
    [lang], // Only recreate the function when `lang` changes
  );

  return memoizedLocalize;
}
