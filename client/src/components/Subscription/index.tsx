import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TUser, useGetUserByIdQuery } from '@librechat/data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

function SubscriptionContent() {
  const [subscriptionUser, setSubscriptionUser] = useState<TUser | null>(null);
  const { userId = '' } = useParams();
  const lang = useRecoilValue(store.lang);
  const navigate = useNavigate();

  const getUserByIdQuery = useGetUserByIdQuery(userId);

  useEffect(() => {
    if (getUserByIdQuery.isSuccess) {
      setSubscriptionUser(getUserByIdQuery.data);
    }
  }, [getUserByIdQuery.isSuccess, getUserByIdQuery.data]);

  async function handleSubscription() {
    console.log('handleSubscription function called');
    try {
      const response = await fetch('/api/payments/create-payment', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      if (data && data.approval_url) {
        window.location.href = data.approval_url;
      } else {
        console.error('Failed to get approval URL');
      }
    } catch (error) {
      console.error(`An error occurred: ${error}`);
    }
  }

  return (
    <>
      <button
        className='absolute top-12 left-0 mx-2 my-1 py-2 px-3 flex items-center rounded-md text-gray-800 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600 md:top-1 md:left-12'
        onClick={() => navigate(-1)}
      >
        ← {localize(lang, 'com_ui_back')}
      </button>

      <div className="absolute top-0 left-0 right-0 flex justify-center items-center py-4">
        <div className="relative flex items-center justify-center mr-2 text-xl dark:text-gray-200">
          {`${subscriptionUser?.name}'s plan`}
        </div>
      </div>

      <div className="flex justify-center mt-20">
        <button
          // onClick={() => alert('Button Clicked!')}
          onClick={handleSubscription}
          className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Subscribe with PayPal
        </button>

      </div>
    </>
  );
}

function Subscription() {
  const { userId } = useParams();
  return <SubscriptionContent key={userId} />;
}

export default Subscription;
