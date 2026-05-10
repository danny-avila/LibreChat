import ToggleSwitch from '../../ToggleSwitch';
import store from '~/store';

export default function AutomaticPlaybackSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  return (
    <ToggleSwitch
      stateAtom={store.automaticPlayback}
      localizationKey={'com_nav_automatic_playback' as const}
      switchId="AutomaticPlayback"
      onCheckedChange={onCheckedChange}
    />
  );
}
