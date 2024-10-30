import { useRecoilState } from 'recoil';
import * as Select from '@ariakit/react/select';
import { Fragment, useState, memo } from 'react';
import { FileText, LogOut, Package } from 'lucide-react';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import { LinkIcon, GearIcon, DropdownMenuSeparator, Panel } from '~/components';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import { GPTIcon, ChatGPTMinimalIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import store from '~/store';
import SubscriptionView from './SubscriptionView';

function SubscriptionSettings() {
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.checkBalance,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showSubscription, setshowSubscription] = useRecoilState(store.showSubscription);

  const avatarSrc = useAvatar(user);
  const name = user?.avatar ?? user?.username ?? '';

  return (
    <Select.SelectProvider>
      <Select.Select
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-accent"
      >
        <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
          <div className="relative flex">
            <div
              style={{
                backgroundColor: 'rgb(0, 0, 0)',
                width: '32px',
                height: '32px',
                padding: '6px',
                boxShadow: 'rgba(240, 246, 252, 0.1) 0px 0px 0px 1px',
              }}
              className="relative flex items-center justify-center rounded-full p-1 text-text-primary"
              aria-hidden="true"
            >
              <GPTIcon/>
            </div>
          </div>
        </div>
        <div
          className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-center text-text-primary"
          style={{ marginTop: '0', marginLeft: '0' }}
        >
          <p>{localize('com_nav_subscription')}</p>
          <small className="text-muted-foreground/70"> بسته پیشرفته کیو استار</small>
        </div>
      </Select.Select>
      <Select.SelectPopover
        className="popover-ui w-[235px]"
        style={{
          transformOrigin: 'bottom',
          marginRight: '0px',
          translate: '0px',
        }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm text-center" role="note">
            بسته پیشرفته کیو استار
        </div>
        <DropdownMenuSeparator/>
        <Select.SelectItem
          value=""
          onClick={() => setshowSubscription(true)}
          className="select-item text-sm text-right rtl:mr-1"
          style={{
            direction: 'rtl',
          }}
        >
          <Package className="icon-md" aria-hidden="true" />
            {localize('com_nav_subscription')}

        </Select.SelectItem>
      </Select.SelectPopover>
      {showSubscription && <SubscriptionView open={showSubscription} onOpenChange={setshowSubscription} />}
    </Select.SelectProvider>
  );
}

export default memo(SubscriptionSettings);
