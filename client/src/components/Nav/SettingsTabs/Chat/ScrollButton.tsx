import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui/Switch';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

export default function ScrollButton({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [showScrollButton, setShowScrollButton] = useRecoilState<boolean>(store.showScrollButton);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setShowScrollButton(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize('com_nav_scroll_button')}</div>
      </div>
      <Switch
        id="scrollButton"
        checked={showScrollButton}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="scrollButton"
      />
    </div>
  );
}
