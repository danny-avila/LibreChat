import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import { Switch } from '~/components/ui/Switch';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

export default function MaximizeChatSpace({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [maximizeChatSpace, setmaximizeChatSpace] = useRecoilState<boolean>(
    store.maximizeChatSpace,
  );
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setmaximizeChatSpace(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize('com_nav_maximize_chat_space')}</div>
        <HoverCardSettings side="bottom" text="com_nav_info_enter_to_send" />
      </div>
      <Switch
        id="maximizeChatSpace"
        checked={maximizeChatSpace}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="maximizeChatSpace"
      />
    </div>
  );
}
