import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function HideSidePanelSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [hideSidePanel, setHideSidePanel] = useRecoilState<boolean>(store.hideSidePanel);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setHideSidePanel(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_hide_panel')}</div>

      <Switch
        id="hideSidePanel"
        checked={hideSidePanel}
        aria-label="Hide right-most side panel"
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="hideSidePanel"
      />
    </div>
  );
}
