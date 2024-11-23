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

    // Separate the last plan and other plans
    const lastPlan = plans[plans.length - 1];
    const otherPlans = plans.slice(0, plans.length - 1);

    return (
        <div className="container mx-auto p-4">
            {/* Alert message */}
            <div
                className="bg-blue-100 border border-blue-400 text-black px-4 py-3 rounded relative mb-8 text-right rtl:mr-0"
                role="alert"
            >
                <strong className="font-bold">{localize('com_nav_warning')}</strong>
                <span className="block sm:inline rtl:mr-2">
          {localize('com_nav_purchase_warning')}
        </span>
            </div>

            {/* Highlighted Last Plan */}
            <div className="mb-12">
                <div
                    key={lastPlan.id}
                    className="flex flex-col p-8 border rounded-lg shadow-lg bg-white dark:bg-gray-800 transform transition duration-300 mx-auto"
                    style={{ maxWidth: '600px' }}
                >
                    <h3 className="text-3xl font-bold text-center text-blue-600 dark:text-blue-400">
                        {lastPlan.name}
                    </h3>
                    <p className="text-center text-gray-500 dark:text-gray-300 mt-2 mb-4">
                        {lastPlan.description}
                    </p>
                    <div
                        className="text-center text-4xl font-extrabold mb-6 text-gray-800 dark:text-gray-100"
                        style={{ direction: 'rtl' }}
                    >
                        {`${lastPlan.price.toLocaleString()} تومان / ${lastPlan.durationInDays} روز`}
                    </div>
                    <ul className="space-y-4 mb-6 text-gray-600 dark:text-gray-300">
                        {lastPlan.features.map((feature, index) => (
                            <li
                                key={index}
                                className="flex items-center gap-3 text-lg text-right"
                                style={{ direction: 'rtl' }}
                            >
                                <SpeechIcon className="w-6 h-6 text-green-500" aria-hidden="true" />
                                {feature}
                            </li>
                        ))}
                    </ul>
                    <button
                        onClick={() => handleBuyClick(lastPlan.id)}
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-medium transition duration-200"
                    >
                        <p className="text-center rtl:mr-0">
                            {isLoading ? localize('com_nav_loading') : lastPlan.buttonLabel}
                        </p>
                    </button>
                </div>
            </div>

            {/* Other Plans in Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {otherPlans.map((plan) => (
                    <div
                        key={plan.id}
                        className="flex flex-col p-8 border rounded-lg shadow-md bg-white dark:bg-gray-800 transform transition duration-300"
                    >
                        <h3 className="text-2xl font-semibold text-center text-blue-600 dark:text-blue-400">
                            {plan.name}
                        </h3>
                        <p className="text-center text-gray-500 dark:text-gray-300 mt-2 mb-3">
                            {plan.description}
                        </p>
                        <div
                            className="text-center text-3xl font-extrabold mb-6 text-gray-800 dark:text-gray-100"
                            style={{ direction: 'rtl' }}
                        >
                            {`${plan.price.toLocaleString()} تومان / ${plan.durationInDays} روز`}
                        </div>
                        <ul className="space-y-4 mb-6 text-gray-600 dark:text-gray-300">
                            {plan.features.map((feature, index) => (
                                <li
                                    key={index}
                                    className="flex items-center gap-3 text-lg text-right"
                                    style={{ direction: 'rtl' }}
                                >
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
                            <p className="text-center rtl:mr-0">
                                {isLoading ? localize('com_nav_loading') : plan.buttonLabel}
                            </p>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SubscriptionDataTable;
