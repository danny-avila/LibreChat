import { useRecoilValue } from 'recoil';
import ToggleSwitch from '../../ToggleSwitch';
import store from '~/store';

export default function CloudBrowserVoicesSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const textToSpeech = useRecoilValue(store.textToSpeech);

  return (
    <ToggleSwitch
      stateAtom={store.cloudBrowserVoices}
      localizationKey={'com_nav_enable_cloud_browser_voice' as const}
      switchId="CloudBrowserVoices"
      onCheckedChange={onCheckedChange}
      disabled={!textToSpeech}
    />
  );
}
