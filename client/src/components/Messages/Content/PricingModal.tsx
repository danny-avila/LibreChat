import React from 'react';
import Modal from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { cn } from '~/utils';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlan: (stripePriceId: string) => void;
}

const plans = [
  {
    name: 'Plus',
    description: 'Essential AI tools for everyday use',
    price: '$10',
    stripePriceId: 'price_123',
    features: [
      '1,000 AI-powered messages',
      '30 image generations',
      'Access to all AI models',
      'Email support',
      'AI prompt library access',
    ],
    popular: false,
  },
  {
    name: 'Pro',
    description: 'Advanced features for serious AI enthusiasts',
    price: '$20',
    stripePriceId: 'price_456',
    features: [
      '5,000 AI-powered messages',
      '100 image generations',
      'Access to all AI models',
      'Priority support',
      'AI prompt library access',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    description: 'Unlimited potential for power users',
    price: '$100',
    stripePriceId: 'price_789',
    features: [
      '10,000 AI-powered messages',
      '300 image generations',
      'Early access to new features',
      '24/7 priority support',
      'Access to all AI models',
      'AI prompt library access',
    ],
    popular: false,
  },
];

const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, onSelectPlan }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="10+ AI models for the price of one!" className="sm:max-w-[800px]">
      <div className="space-y-6">
        <p className="text-center text-gray-600 mb-8">
          Access ChatGPT, Claude, Perplexity, Stable Diffusion, and more - all-in-one.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'flex flex-col rounded-lg border p-6',
                plan.popular ? 'border-blue-500 shadow-md relative' : 'border-gray-200',
                'bg-white',
              )}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 -mt-3 -mr-3 px-3 py-1 bg-blue-500 text-white text-xs font-semibold rounded-full">
                  MOST POPULAR
                </div>
              )}
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              <p className="mt-2 text-sm text-gray-600">{plan.description}</p>
              <p className="mt-4 text-3xl font-bold">
                {plan.price}<span className="text-base font-normal text-gray-600">/month</span>
              </p>
              <Button
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => onSelectPlan(plan.stripePriceId)}
              >
                Upgrade to {plan.name}
              </Button>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center text-sm text-gray-600">
                    <svg
                      className="mr-3 h-5 w-5 text-green-500"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M5 13l4 4L19 7"></path>
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default PricingModal;