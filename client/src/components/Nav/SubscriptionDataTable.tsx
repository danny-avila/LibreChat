import React from 'react';
import { GearIcon, DataIcon, SpeechIcon, UserIcon, ExperimentIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

interface PricingPlan {
    name: string;
    price: string;
    description: string;
    features: string[];
    buttonLabel: string;
}

interface PricingListProps {
    plans: PricingPlan[];
}

export default function PricingList({ plans }: PricingListProps) {
  const localize = useLocalize();

  return (
    <div className="container mx-auto p-1">
      <h2 className="text-4xl font-bold text-center mb-12 text-gray-800 dark:text-gray-100">
        {localize('com_nav_subscription_plans')}
      </h2>
      <div className="flex flex-col md:flex-row items-center justify-center gap-8">
        {plans.map((plan, index) => (
          <div
            key={index}
            className="flex flex-col max-w-md p-8 border rounded-lg shadow-md bg-white dark:bg-gray-800 hover:scale-105 transform transition duration-300"
            style={{ width: '100%', minWidth: '280px' }}
          >
            <h3 className="text-2xl font-semibold text-center text-blue-600 dark:text-blue-400">
              {plan.name}
            </h3>
            <p className="text-center text-gray-500 dark:text-gray-300 mt-2 mb-3">{plan.description}</p>
            <div style={{ direction: 'rtl' }} className="text-center text-3xl font-extrabold mb-6 text-gray-800 dark:text-gray-100 rtl:peer-focus:left-auto">
              {plan.price}
            </div>
            <ul className="space-y-4 mb-6 text-gray-600 dark:text-gray-300">
              {plan.features.map((feature, featureIndex) => (
                <li key={featureIndex} className="flex items-center gap-3 text-lg text-right" style={{ direction: 'rtl' }}>
                  <SpeechIcon className="w-6 h-6 text-green-500" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <button  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-medium transition duration-200">
              {plan.buttonLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
