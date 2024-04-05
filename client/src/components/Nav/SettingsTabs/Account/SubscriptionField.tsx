import axios from 'axios';
import { isPast } from 'date-fns';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useToast } from '~/hooks';

import store from '~/store';

function SubscriptionField() {
  const user = useRecoilValue(store.user);
  const setUser = useSetRecoilState(store.user);
  const location = useLocation();
  const { showToast } = useToast();

  const handleSubscribeClick = () => {
    axios({
      method: 'post',
      url: '/api/subscribe/premium',
      data: {
        callback: location.pathname,
      },
      withCredentials: true,
    })
      .then((res) => {
        const session = res.data.session;
        window.location.href = session.url;
      })
      .catch((err) => console.error(err));
  };

  const handleUnSubscriptionClick = () => {
    axios({
      method: 'post',
      url: '/api/subscribe/cancel',
      withCredentials: true,
      data: {
        renewalDate: user?.subscription.renewalDate
          ? (new Date(user?.subscription.renewalDate).toLocaleDateString() as string)
          : '',
      },
    })
      .then(() => {
        setUser((prev) =>
          prev ? { ...prev, subscription: { ...prev.subscription, active: false } } : undefined,
        );

        showToast({ message: 'Subscription cancelled', status: 'success' });
      })
      .catch((err) => console.error(err));
  };

  const handleReactiveClick = () => {
    axios({
      method: 'post',
      url: '/api/subscribe/reactive',
      data: {
        callback: location.pathname,
      },
      withCredentials: true,
    })
      .then(() => {
        setUser((prev) =>
          prev ? { ...prev, subscription: { ...prev.subscription, active: true } } : undefined,
        );

        showToast({ message: 'Subscription reactivated', status: 'success' });
      })
      .catch((err) => console.error(err));
  };

  return (
    <>
      {user?.subscription.active ? (
        <div className="flex flex-col justify-start gap-3 text-left">
          <p>
            You are currently subscribed for <b>ChatG Premium</b> /{' '}
            <b>{user?.subscription.subType === 'MONTHLY' ? 'Monthly' : 'Yearly'}</b>
          </p>
          <p>
            Renewal date:{' '}
            {user.subscription.renewalDate && (
              <>{new Date(user.subscription.renewalDate).toLocaleDateString()}</>
            )}
          </p>
          <button
            onClick={handleUnSubscriptionClick}
            className="rounded-md text-left text-red-600 transition hover:text-red-500"
          >
            Cancel membership
          </button>
        </div>
      ) : user?.subscription.renewalDate && !isPast(user?.subscription.renewalDate) ? (
        <div className="flex flex-col justify-start gap-3 text-left">
          <p>
            Thank you for being a <b>ChatG Premium</b> member
          </p>
          <p>
            Your subscription will end on{' '}
            {user?.subscription.renewalDate && (
              <>{new Date(user?.subscription.renewalDate).toLocaleDateString()}</>
            )}
          </p>

          <button
            onClick={handleReactiveClick}
            className="rounded-md text-left text-green-550 transition hover:text-green-500"
          >
            Re-active premium membership
          </button>
        </div>
      ) : (
        <div className="flex flex-col justify-start gap-3 text-left">
          <p>
            You are currently not subscribed for <b>ChatG Premium</b>
          </p>
          <p>Subscribe now to unlock all AI Models and Features</p>

          <button
            onClick={handleSubscribeClick}
            className="rounded-md text-left text-green-550 transition hover:text-green-500"
          >
            Subscribe for premium membership
          </button>
        </div>
      )}
    </>
  );
}

export default React.memo(SubscriptionField);
