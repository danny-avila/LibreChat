import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function AutoScrollSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [autoScroll, setAutoScroll] = useRecoilState<boolean>(store.autoScroll);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setAutoScroll(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div> {localize('com_nav_auto_scroll')} </div>
      <Switch
        id="autoScroll"
        checked={autoScroll}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="autoScroll"
      />
    </div>
  );
}
