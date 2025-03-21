import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import { Switch } from '~/components/ui/Switch';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

export default function CenterChatInput({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [centerFormOnLanding, setcenterFormOnLanding] = useRecoilState(store.centerFormOnLanding);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setcenterFormOnLanding(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_center_chat_input')}</div>
      <Switch
        id="centerFormOnLanding"
        checked={centerFormOnLanding}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="centerFormOnLanding"
      />
    </div>
  );
}
