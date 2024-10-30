import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function AutomaticPlaybackSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [automaticPlayback, setAutomaticPlayback] = useRecoilState(store.automaticPlayback);

  const handleCheckedChange = (value: boolean) => {
    setAutomaticPlayback(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_automatic_playback')}</div>
      <Switch
        id="AutomaticPlayback"
        checked={automaticPlayback}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="AutomaticPlayback"
      />
    </div>
  );
}
