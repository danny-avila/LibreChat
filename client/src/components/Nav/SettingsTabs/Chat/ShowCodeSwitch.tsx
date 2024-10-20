import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ShowCodeSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [showCode, setShowCode] = useRecoilState<boolean>(store.showCode);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setShowCode(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div> {localize('com_nav_show_code')} </div>
      <Switch
        id="showCode"
        checked={showCode}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="showCode"
      />
    </div>
  );
}
