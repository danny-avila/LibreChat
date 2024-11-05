import { useRecoilState } from 'recoil';
import * as Select from '@ariakit/react/select';
import { useState, memo } from 'react';
import { FileText, Package, Clock3 } from 'lucide-react';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import { LinkIcon, GearIcon, DropdownMenuSeparator, Panel } from '~/components';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import { GPTIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import store from '~/store';
import SubscriptionView from './SubscriptionView';
import PaymentHistory from './PaymentHistory';

const SubscriptionSettings: React.FC = () => {
  const localize = useLocalize();
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.checkBalance,
  });
  const [showSubscription, setShowSubscription] = useRecoilState(store.showSubscription);
  const [showPaymentHistory, setShowPaymentHistory] = useRecoilState(store.showPaymentHistory);

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
              <GPTIcon />
            </div>
          </div>
        </div>
        <div className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-center text-text-primary">
          <p>{localize('com_nav_subscription')}</p>
          <small className="text-muted-foreground/70">
            {startupConfig?.checkBalance && balanceQuery.data && (
              `${localize('com_nav_balance')}: ${parseFloat(balanceQuery.data.balance.toString()).toFixed(2)}`
            )}
          </small>
        </div>
      </Select.Select>
      <Select.SelectPopover className="popover-ui w-[235px]">
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm text-center">
          {startupConfig?.checkBalance && balanceQuery.data && (
            `${localize('com_nav_balance')}: ${parseFloat(balanceQuery.data.balance.toString()).toFixed(2)}`
          )}
        </div>
        <DropdownMenuSeparator />
        <Select.SelectItem
          value=""
          onClick={() => setShowSubscription(true)}
          className="select-item text-sm text-right rtl:mr-1"
          style={{ direction: 'rtl' }}
        >
          <Package className="icon-md" aria-hidden="true" />
          {localize('com_nav_subscription')}
        </Select.SelectItem>
        <Select.SelectItem
          value=""
          onClick={() => setShowPaymentHistory(true)}
          className="select-item text-sm text-right rtl:mr-1"
          style={{ direction: 'rtl' }}
        >
          <Clock3 className="icon-md" aria-hidden="true" />
          {localize('com_nav_payment_history')}
        </Select.SelectItem>
      </Select.SelectPopover>
      {showSubscription && <SubscriptionView open={showSubscription} onOpenChange={setShowSubscription} />}
      {showPaymentHistory && <PaymentHistory open={showPaymentHistory} onOpenChange={setShowPaymentHistory} />}
    </Select.SelectProvider>
  );
};

export default memo(SubscriptionSettings);
