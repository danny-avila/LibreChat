import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function CloudBrowserVoicesSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [cloudBrowserVoices, setCloudBrowserVoices] = useRecoilState<boolean>(
    store.cloudBrowserVoices,
  );
  const [textToSpeech] = useRecoilState<boolean>(store.textToSpeech);

  const handleCheckedChange = (value: boolean) => {
    setCloudBrowserVoices(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_enable_cloud_browser_voice')}</div>
      <Switch
        id="CloudBrowserVoices"
        checked={cloudBrowserVoices}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="CloudBrowserVoices"
        disabled={!textToSpeech}
      />
    </div>
  );
}
