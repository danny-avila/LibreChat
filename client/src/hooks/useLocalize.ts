import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';
import store from '~/store';

export default function useLocalize() {
  const lang = useRecoilValue(store.lang);
  return (phraseKey: string, values?: string[]) => localize(lang, phraseKey, ...(values ?? []));
}
