import { useRecoilState } from 'recoil';
import { Switch } from '@librechat/client';
import HoverCardSettings from '../HoverCardSettings';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function SaveBadgesState({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [saveBadgesState, setSaveBadgesState] = useRecoilState<boolean>(store.saveBadgesState);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setSaveBadgesState(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize('com_nav_save_badges_state')}</div>
        <HoverCardSettings side="bottom" text="com_nav_info_save_badges_state" />
      </div>
      <Switch
        id="saveBadgesState"
        checked={saveBadgesState}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="saveBadgesState"
      />
    </div>
  );
}
