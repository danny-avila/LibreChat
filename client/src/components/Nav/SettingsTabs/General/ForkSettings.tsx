import { useLocalize } from '~/hooks';
import { useRecoilState } from 'recoil';
import { Dropdown, Switch } from '~/components/ui';
import store from '~/store';

export const ForkSettings = () => {
  const localize = useLocalize();
  const [forkSetting, setForkSetting] = useRecoilState(store.forkSetting);
  const [remember, setRemember] = useRecoilState<boolean>(store.rememberForkOption);

  const forkOptions = [
    { value: 'directPath', display: localize('com_ui_fork_visible') },
    { value: 'includeBranches', display: localize('com_ui_fork_branches') },
    { value: '', display: localize('com_ui_fork_all_target') },
  ];

  return (
    <>
      <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div> {localize('com_ui_fork_change_default')} </div>
          <Dropdown
            value={forkSetting}
            onChange={setForkSetting}
            options={forkOptions}
            width={200}
            testId="fork-setting-dropdown"
          />
        </div>
      </div>
      <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
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
    </>
  );
};
