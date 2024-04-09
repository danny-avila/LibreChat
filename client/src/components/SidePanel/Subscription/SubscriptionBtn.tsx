/* eslint-disable indent */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { Tooltip } from 'react-tooltip';
import { useLocalize } from '~/hooks';
import store from '~/store';
import useToast from '~/hooks/useToast';
import SubscriptionPopup from './SubscriptionPopup';
import { topupSubscribeAction } from '~/utils/subscribe';
import { isPast } from 'date-fns';
import isEmpty from 'is-empty';

export default function SubscriptionBtn() {
  const localize = useLocalize();
  const [searchParams, setSearchParams] = useSearchParams();
  const [popupOpen, setPopupOpen] = useState<boolean>(false);
  const user = useRecoilValue(store.user);
  const transition = {
    transition: 'transform 0.3s ease, opacity 0.2s ease',
  };
  const { showToast } = useToast();

  useEffect(() => {
    if (searchParams.get('subscribe') === 'welcome') {
      showToast({ message: localize('com_subscribe_welcome'), status: 'success' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <button
        onClick={() => {
          if (
            (!user?.subscription.active && isEmpty(user?.subscription.renewalDate)) ||
            isPast(user?.subscription.renewalDate as Date)
          ) {
            setPopupOpen(true);
          }
        }}
        data-tooltip-id="subscribe-tooltip"
        className="duration-350 mt-text-sm mb-1 flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
        style={{ ...transition }}
      >
        <span className="border-token-border-light flex h-7 w-7 items-center justify-center rounded-full border bg-white">
          <img src="/assets/premium.png" alt="premium-icon" />
        </span>
        <p className="font-bold text-black dark:text-white">
          {localize(
            user?.subscription.active ||
              (!isEmpty(user?.subscription.renewalDate) &&
                !isPast(user?.subscription.renewalDate as Date))
              ? 'com_menu_premium_member'
              : 'com_menu_subscribe_btn',
          )}
        </p>
        {!user?.subscription.active &&
          isEmpty(user?.subscription.renewalDate) &&
          isPast(user?.subscription.renewalDate as Date) && (
            <Tooltip
              place="top"
              id="subscribe-tooltip"
              content={localize('com_menu_subscribe_tooltip')}
            />
          )}
      </button>
      <SubscriptionPopup open={popupOpen} setOpen={setPopupOpen} />
      {(user?.subscription.active ||
        (!isEmpty(user?.subscription.renewalDate) &&
          !isPast(user?.subscription.renewalDate as Date))) && (
        <>
          <button
            onClick={topupSubscribeAction}
            className="w-full rounded-xl bg-green-500 px-3 py-2 text-[13px] text-white transition-all hover:bg-green-400"
          >
            + Add Credits
          </button>
          <button
            className="flex w-full cursor-pointer items-center gap-3 rounded-md p-[8px] text-sm font-bold text-black hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
            onClick={() => setSearchParams({ settings: 'open', tab: 'credits' })}
          >
            <img src="/assets/ChatGCreditsIcon.png" width={30} height={10} />
            <p>ChatG Credits: {user?.credits ?? 0}</p>
          </button>
        </>
      )}
    </div>
  );
}
