import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function CacheTTSSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [cacheTTS, setCacheTTS] = useRecoilState<boolean>(store.cacheTTS);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setCacheTTS(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_enable_cache_tts')}</div>
      <Switch
        id="CacheTTS"
        checked={cacheTTS}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="CacheTTS"
      />
    </div>
  );
}
