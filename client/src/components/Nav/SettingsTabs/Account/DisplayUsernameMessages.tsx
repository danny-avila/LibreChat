import React from 'react';
import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import { Switch, Label } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function DisplayUsernameMessages() {
  const localize = useLocalize();
  const [UsernameDisplay, setUsernameDisplay] = useRecoilState(store.UsernameDisplay);

  const handleCheckedChange = (checked: boolean) => {
    setUsernameDisplay(checked);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Label className="font-light">{localize('com_nav_user_name_display')}</Label>
        <HoverCardSettings side="bottom" text="com_nav_info_user_name_display" />
      </div>
      <Switch
        id="UsernameDisplay"
        checked={UsernameDisplay}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="UsernameDisplay"
      />
    </div>
  );
}
