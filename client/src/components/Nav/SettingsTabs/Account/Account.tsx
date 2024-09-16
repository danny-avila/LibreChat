import React from 'react';
import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import DeleteAccount from './DeleteAccount';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import Avatar from './Avatar';
import store from '~/store';

function Account({ onCheckedChange }: { onCheckedChange?: (value: boolean) => void }) {
  const [UsernameDisplay, setUsernameDisplay] = useRecoilState<boolean>(store.UsernameDisplay);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setUsernameDisplay(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
        <Avatar />
      </div>
      <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
        <DeleteAccount />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div>{localize('com_nav_user_name_display')}</div>
          <HoverCardSettings side="bottom" text="com_nav_info_user_name_display" />
        </div>
        <Switch
          id="UsernameDisplay"
          checked={UsernameDisplay}
          onCheckedChange={handleCheckedChange}
          className="ml-4 mt-2"
          data-testid="UsernameDisplay"
        />
      </div>
    </div>
  );
}

export default React.memo(Account);
