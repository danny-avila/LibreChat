import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import { ForkOptions } from 'librechat-data-provider';
import { Dropdown, Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export const ForkSettings = () => {
  const localize = useLocalize();
  const [forkSetting, setForkSetting] = useRecoilState(store.forkSetting);
  const [splitAtTarget, setSplitAtTarget] = useRecoilState(store.splitAtTarget);
  const [remember, setRemember] = useRecoilState<boolean>(store.rememberForkOption);

  const forkOptions = [
    { value: ForkOptions.DIRECT_PATH, display: localize('com_ui_fork_visible') },
    { value: ForkOptions.INCLUDE_BRANCHES, display: localize('com_ui_fork_branches') },
    { value: ForkOptions.TARGET_LEVEL, display: localize('com_ui_fork_all_target') },
  ];

  return (
    <>
      <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div>{localize('com_ui_fork_change_default')}</div>
            <HoverCardSettings side="bottom" text="com_nav_info_fork_change_default" />
          </div>
          <Dropdown
            value={forkSetting}
            onChange={setForkSetting}
            options={forkOptions}
            sizeClasses="w-[200px]"
            anchor="bottom start"
            testId="fork-setting-dropdown"
          />
        </div>
      </div>
      <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <div> {localize('com_ui_fork_default')} </div>
          <Switch
            id="rememberForkOption"
            checked={remember}
            onCheckedChange={setRemember}
            className="ml-4 mt-2"
            data-testid="rememberForkOption"
          />
        </div>
      </div>
      <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div>{localize('com_ui_fork_split_target_setting')}</div>
            <HoverCardSettings side="bottom" text="com_nav_info_fork_split_target_setting" />
          </div>
          <Switch
            id="splitAtTarget"
            checked={splitAtTarget}
            onCheckedChange={setSplitAtTarget}
            className="ml-4 mt-2"
            data-testid="splitAtTarget"
          />
        </div>
      </div>
    </>
  );
};
