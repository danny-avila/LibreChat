import React, { Dispatch, SetStateAction, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { useRecoilValue } from 'recoil';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { useLocalize, useMediaQuery } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';
import { LoadingIcon } from '~/components/svg';
import SubDetailsExplain from './SubDetailsExplain';
import SubTab from './SubTab';

export default function SubscriptionPopup({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const location = useLocation();
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const localize = useLocalize();
  const [selectedPlan, setSelectedPlan] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const user = useRecoilValue(store.user);
  const [subLoading, setSubLoading] = useState<boolean>(false);

  const handleSubscribeClick = () => {
    if (user?.subscription.active) {
      return;
    }
    setSubLoading(true);
    axios({
      method: 'post',
      url: '/api/subscribe/premium',
      data: {
        callback: location.pathname,
        plan: selectedPlan,
      },
      withCredentials: true,
    })
      .then((res) => {
        const session = res.data.session;
        window.location.href = session.url;
      })
      .catch((err) => {
        console.error(err);
        setSubLoading(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          'p-5 shadow-2xl dark:bg-gray-800 dark:text-white md:min-h-[373px] md:w-[680px]',
          isSmallScreen ? 'top-20 -translate-y-0' : '',
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-4 text-lg font-medium leading-6 text-gray-800 dark:text-gray-200">
            <img src="/assets/premium.png" className="h-7 w-7" alt="premium" />
            {localize('com_subscription_popup_title')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex h-full flex-col gap-3 overflow-auto px-5 outline-none">
          <div className="flex flex-col gap-3 overflow-auto">
            <p>{localize('com_subscription_plan_desc')}</p>
            <div className="flex w-full flex-col gap-3 md:flex-row">
              <SubTab
                isSelected={selectedPlan === 'YEARLY'}
                setIsSelected={() => setSelectedPlan('YEARLY')}
                title={
                  <div className="flex w-full items-center justify-between">
                    <p>Yearly</p>
                    <p
                      className={`rounded-xl border-[1px] border-solid p-1 px-2 text-[10px] ${
                        selectedPlan === 'MONTHLY'
                          ? 'border-gray-300 bg-transparent text-gray-400'
                          : 'border-gray-500 bg-[#00ff00] text-black'
                      }`}
                    >
                      Best Value - Save 17%
                    </p>
                  </div>
                }
                desc={
                  <>
                    <p className="text-[16px] font-bold">
                      <i className="mr-3 not-italic line-through">USD $14.99/mo</i>
                      USD $12.49/mo
                    </p>
                    <p className="text-[14px]">
                      <i className="mr-3 not-italic line-through">USD $179.99/yr</i>
                      USD $149.99/yr
                    </p>
                  </>
                }
              />
              <SubTab
                isSelected={selectedPlan === 'MONTHLY'}
                setIsSelected={() => setSelectedPlan('MONTHLY')}
                title="Monthly"
                desc={
                  <>
                    <p className="text-[16px] font-bold">USD $14.99/mo</p>
                    <p className="text-[14px]">USD $179.99/yr</p>
                  </>
                }
              />
            </div>
            <SubDetailsExplain />
          </div>
          <p className="text-[11px]">
            By subscribing, you are enrolling in automatic payments of{' '}
            {selectedPlan === 'MONTHLY' ? 'CA$14.99' : 'CA$149.99'}/
            {selectedPlan === 'MONTHLY' ? 'monthly' : 'yearly'} (plus tax, where applicable). Cancel
            or manage your subscription through Stripe&apos;s customer portal from Settings.
            <a href="https://chatg.com/subscriber_tos" className="ml-1 text-green-500">
              Subscriber Terms
            </a>{' '}
            apply.
          </p>
          <button
            className={`w-full rounded-lg p-2 text-white transition ${
              user?.subscription.active
                ? 'bg-green-300 hover:bg-green-300'
                : 'bg-green-550 hover:bg-green-500'
            }`}
            onClick={handleSubscribeClick}
            disabled={user?.subscription.active}
          >
            {subLoading ? <LoadingIcon /> : <>{localize('com_menu_subscribe_btn')}</>}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
