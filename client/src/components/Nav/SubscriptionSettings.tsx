import { useRecoilState } from 'recoil';
import * as Select from '@ariakit/react/select';
import { memo } from 'react';
import { Package, Clock3 } from 'lucide-react';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import { DropdownMenuSeparator } from '~/components';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import { GPTIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
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

  const avatarSrc = useAvatar(user);
  const balance = parseFloat(balanceQuery.data?.balance);
  const planName = balanceQuery.data?.subscription?.planName;

  return (
    <Select.SelectProvider>
      <Select.Select
        data-testid="nav-user"
        className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-accent"
      >
        <div className="h-8 w-8 flex-shrink-0">
          <div
            className="relative flex items-center justify-center rounded-full p-1 bg-black shadow-md"
            style={{ width: '32px', height: '32px' }}
          >
            <GPTIcon className="text-text-primary" />
          </div>
        </div>
        <div className="flex flex-col items-center grow overflow-hidden text-text-primary text-center">
          <p className="text-ellipsis whitespace-nowrap">
            {startupConfig?.checkBalance && planName ? planName : localize('com_nav_subscription')}
          </p>
          {startupConfig?.checkBalance && (
            <small className="text-muted-foreground/70">
              {localize('com_nav_balance')}: {balance?.toFixed(2)}
            </small>
          )}
        </div>
      </Select.Select>
      <Select.SelectPopover className="popover-ui w-[235px]">
        {startupConfig?.checkBalance && (
          <div className="text-token-text-secondary mx-3 py-2 text-sm text-center">
            {localize('com_nav_balance')}: {balance?.toFixed(2)}
          </div>
        )}
        <DropdownMenuSeparator />
        <Select.SelectItem
          value=""
          onClick={() => setShowSubscription(true)}
          className="select-item text-sm text-right rtl:mr-1 flex items-center"
          style={{ direction: 'rtl' }}
        >
          <Package className="icon-md" aria-hidden="true" />
          {localize('com_nav_subscription')}
        </Select.SelectItem>
        <Select.SelectItem
          value=""
          onClick={() => setShowPaymentHistory(true)}
          className="select-item text-sm text-right rtl:mr-1 flex items-center"
          style={{ direction: 'rtl' }}
        >
          <Clock3 className="icon-md" aria-hidden="true" />
          {localize('com_nav_payment_history')}
        </Select.SelectItem>
      </Select.SelectPopover>
      {showSubscription && (
        <SubscriptionView open={showSubscription} onOpenChange={setShowSubscription} />
      )}
      {showPaymentHistory && (
        <PaymentHistory open={showPaymentHistory} onOpenChange={setShowPaymentHistory} />
      )}
    </Select.SelectProvider>
  );
};

export default memo(SubscriptionSettings);
