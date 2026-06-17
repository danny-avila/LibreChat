import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TopUpCard from './TopUpCard';

const mockMutate = jest.fn();
const mockShowToast = jest.fn();

jest.mock(
  '@librechat/client',
  () => ({
    Button: ({ children, ...props }) => <button {...props}>{children}</button>,
    Input: (props) => <input {...props} />,
    Label: ({ children, ...props }) => <label {...props}>{children}</label>,
    useToastContext: () => ({ showToast: mockShowToast }),
  }),
  { virtual: true },
);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string>) => {
    if (key === 'com_nav_balance_top_up_limits') {
      return `${options?.min} - ${options?.max}`;
    }
    if (key === 'com_nav_balance_top_up_invalid_amount') {
      return `${options?.min} - ${options?.max}`;
    }
    if (key === 'com_nav_balance_top_up_fixed') {
      return options?.amount ?? key;
    }
    if (key === 'com_nav_balance_top_up_preview_value') {
      return options?.credits ?? key;
    }
    if (key === 'com_ui_redirecting_to_provider') {
      return 'Redirecting';
    }
    return key;
  },
}));

jest.mock('~/data-provider', () => ({
  useCreateStripeCheckoutSessionMutation: () => ({
    mutate: mockMutate,
    isLoading: false,
  }),
}));

beforeEach(() => {
  mockMutate.mockReset();
  mockShowToast.mockReset();
});

describe('TopUpCard', () => {
  it('submits the selected USD amount to Stripe checkout', () => {
    render(
      <TopUpCard
        config={{
          enabled: true,
          allowCustomAmount: true,
          minUsd: 2,
          maxUsd: 25,
          creditsPerUsd: 1000000,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('com_nav_balance_top_up_amount'), {
      target: { value: '5.50' },
    });
    fireEvent.click(screen.getByText('com_nav_balance_top_up_button'));

    expect(mockMutate).toHaveBeenCalledWith({ amountUsd: 5.5 });
  });

  it('disables checkout when the amount is outside the allowed range', () => {
    render(
      <TopUpCard
        config={{
          enabled: true,
          allowCustomAmount: true,
          minUsd: 2,
          maxUsd: 25,
          creditsPerUsd: 1000000,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('com_nav_balance_top_up_amount'), {
      target: { value: '1.00' },
    });

    expect(screen.getByText('com_nav_balance_top_up_button')).toBeDisabled();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});