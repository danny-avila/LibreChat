import React from 'react';
import { SpeechIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { useBuySubscriptionPlan } from 'librechat-data-provider/react-query';

interface PricingPlan {
    id: string;
    name: string;
    price: number;
    durationInDays: number;
    description?: string;
    features: string[];
    tokenCredits: number;
    buttonLabel?: string;
}

interface SubscriptionDataTableProps {
    plans: PricingPlan[];
}

const SubscriptionDataTable: React.FC<SubscriptionDataTableProps> = ({ plans }) => {
  const localize = useLocalize();
  const { mutate: buySubscription, isLoading } = useBuySubscriptionPlan();

  const handleBuyClick = (planId: string) => {
    buySubscription(
      { planId },
      {
        onSuccess: (response) => {
          if (response.authority && response.url) {
            window.location.href = response.url;
          } else {
            alert(response.authority || 'Payment initialized successfully');
          }
        },
        onError: (error) => {
          console.error('Payment initiation failed', error);
          alert('Failed to initiate payment. Please try again.');
        },
      },
    );
  };

  return (
    <div className="container mx-auto p-1">
      {/* Alert message */}
      <div className="bg-yellow-50 border border-yellow-400 text-white-700 px-4 py-3 rounded relative mb-4 text-right rtl:mr-0 " role="alert">
        <strong className="font-bold">{localize('com_nav_warning')}</strong>
        <span className="block sm:inline rtl:mr-2">
          {localize('com_nav_purchase_warning')}
        </span>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 overflow-y-auto max-h-[75vh]">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col max-w-md p-8 border rounded-lg shadow-md bg-white dark:bg-gray-800  transform transition duration-300"
            style={{ width: '100%', minWidth: '280px' }}
          >
            <h3 className="text-2xl font-semibold text-center text-blue-600 dark:text-blue-400">
              {plan.name}
            </h3>
            <p className="text-center text-gray-500 dark:text-gray-300 mt-2 mb-3">{plan.description}</p>
            <div style={{ direction: 'rtl' }} className="text-center text-3xl font-extrabold mb-6 text-gray-800 dark:text-gray-100 rtl:peer-focus:left-auto">
              {`${plan.price.toLocaleString()} تومان / ${plan.durationInDays} روز`}
            </div>
            <ul className="space-y-4 mb-6 text-gray-600 dark:text-gray-300">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3 text-lg text-right" style={{ direction: 'rtl' }}>
                  <SpeechIcon className="w-6 h-6 text-green-500" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleBuyClick(plan.id)}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-medium transition duration-200"
            >
              <p className="text-center rtl:mr-0">{isLoading ? localize('com_nav_loading') : plan.buttonLabel}</p>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubscriptionDataTable;
