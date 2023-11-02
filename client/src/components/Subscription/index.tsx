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

      <div className="absolute top-24 left-0 right-0 flex justify-center items-center py-4">
        <div className="relative flex items-center justify-center mr-2 text-xl dark:text-gray-200">
          {`${subscriptionUser?.name}'s Plan Management`}
        </div>
      </div>

      <div className="mt-10 mx-auto border rounded" style={{ width: '900px', marginTop: '200px' }}>
        {/* Row 1 */}
        <div className="flex w-full">
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">Pre-paid Plan Options</div>
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">Payment Option</div>
          <div className="w-1/3 p-2 border bg-green-500 flex items-center justify-center">Plan Due Date</div>
        </div>

        {/* Row 2 */}
        <div className="flex w-full">
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">by Month: 30$/Month</div>
          <div className="w-1/3 p-2 border border-r flex items-center justify-center bg-green-500 hover:bg-blue-600"> {/* Flex centering added */}
            <button
              onClick={handleSubscription}
              className="w-full h-full text-white rounded hover:bg-blue-600"
            >
              PayPal
            </button>
          </div>
          <div className="w-1/3 p-2 border bg-green-500 flex items-center justify-center">Plan Due Date</div>
        </div>

        {/* Row 3 */}
        <div className="flex w-full">
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">by Quater: 28$/Month x 3 </div>
          <div className="w-1/3 p-2 border border-r bg-green-500 hover:bg-blue-600 flex items-center justify-center">Box 1</div>
          <div className="w-1/3 p-2 border bg-green-500 flex items-center justify-center">Plan Due Date</div>
        </div>

        {/* Row 4 */}
        <div className="flex w-full">
          <div className="w-1/3 p-2 border border-r bg-green-500 flex items-center justify-center">by Year: 25$/Month x 12</div>
          <div className="w-1/3 p-2 border border-r bg-green-500 hover:bg-blue-600 flex items-center justify-center">Box 2</div>
          <div className="w-1/3 p-2 border bg-green-500 flex items-center justify-center">Plan Due Date</div>
        </div>
      </div>
    </>
  );
}

function Subscription() {
  const { userId } = useParams();
  return <SubscriptionContent key={userId} />;
}

export default Subscription;