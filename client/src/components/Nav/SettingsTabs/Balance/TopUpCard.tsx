import React, { useMemo, useState } from 'react';
import { Button, Input, Label, useToastContext } from '@librechat/client';
import type { TStripePaymentsConfig } from 'librechat-data-provider';
import { useCreateStripeCheckoutSessionMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface TopUpCardProps {
  config?: TStripePaymentsConfig;
}

const formatUsd = (amount: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatCredits = (credits: number) => new Intl.NumberFormat().format(credits);

function normalizeUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function TopUpCard({ config }: TopUpCardProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const minUsd = config?.minUsd ?? 1;
  const maxUsd = config?.maxUsd ?? 100;
  const creditsPerUsd = config?.creditsPerUsd ?? 1000000;
  const allowCustomAmount = config?.allowCustomAmount ?? false;
  const defaultAmount = useMemo(() => normalizeUsd(minUsd).toFixed(2), [minUsd]);
  const [amount, setAmount] = useState<string>(defaultAmount);

  const createCheckoutSession = useCreateStripeCheckoutSessionMutation({
    onSuccess: (data) => {
      if (!data.url) {
        showToast({
          status: 'error',
          message: localize('com_nav_balance_top_up_checkout_missing'),
        });
        return;
      }

      window.location.href = data.url;
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        localize('com_nav_balance_top_up_error');
      showToast({ status: 'error', message });
    },
  });

  if (!config?.enabled) {
    return null;
  }

  const amountUsd = normalizeUsd(Number.parseFloat(amount));
  const hasNumericAmount = Number.isFinite(amountUsd);
  const isBelowMinimum = hasNumericAmount && amountUsd < minUsd;
  const isAboveMaximum = hasNumericAmount && amountUsd > maxUsd;
  const isValidAmount = hasNumericAmount && !isBelowMinimum && !isAboveMaximum;
  const previewCredits = isValidAmount ? Math.round(amountUsd * creditsPerUsd) : 0;

  const handleTopUp = () => {
    if (createCheckoutSession.isLoading || !isValidAmount) {
      return;
    }

    createCheckoutSession.mutate({ amountUsd });
  };

  return (
    <div className="rounded-xl border border-border-medium bg-surface-secondary p-4">
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {localize('com_nav_balance_top_up')}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_nav_balance_top_up_description')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="stripe-top-up-amount">
            {localize('com_nav_balance_top_up_amount')}
          </Label>
          <Input
            id="stripe-top-up-amount"
            type="number"
            inputMode="decimal"
            min={minUsd}
            max={maxUsd}
            step="0.01"
            value={amount}
            disabled={!allowCustomAmount || createCheckoutSession.isLoading}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby="stripe-top-up-help stripe-top-up-error"
          />
          <p id="stripe-top-up-help" className="text-xs text-text-secondary">
            {localize('com_nav_balance_top_up_limits', {
              min: formatUsd(minUsd),
              max: formatUsd(maxUsd),
            })}
          </p>
          {!allowCustomAmount && (
            <p className="text-xs text-text-secondary">
              {localize('com_nav_balance_top_up_fixed', { amount: formatUsd(minUsd) })}
            </p>
          )}
          {!isValidAmount && (
            <p id="stripe-top-up-error" className="text-xs text-red-600">
              {localize('com_nav_balance_top_up_invalid_amount', {
                min: formatUsd(minUsd),
                max: formatUsd(maxUsd),
              })}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-primary px-3 py-2">
          <span className="text-sm text-text-secondary">
            {localize('com_nav_balance_top_up_preview_label')}
          </span>
          <span className="text-sm font-medium text-text-primary">
            {isValidAmount
              ? localize('com_nav_balance_top_up_preview_value', {
                  credits: formatCredits(previewCredits),
                })
              : localize('com_nav_balance_top_up_preview_unavailable')}
          </span>
        </div>

        <Button
          type="button"
          onClick={handleTopUp}
          disabled={!isValidAmount || createCheckoutSession.isLoading}
          className="self-start"
        >
          {createCheckoutSession.isLoading
            ? localize('com_ui_redirecting_to_provider', { 0: 'Stripe' })
            : localize('com_nav_balance_top_up_button')}
        </Button>
      </div>
    </div>
  );
}

export default React.memo(TopUpCard);