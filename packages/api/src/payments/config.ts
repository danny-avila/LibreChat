import type { AppConfig } from '@librechat/data-schemas';
import type { TStripePaymentsConfig } from 'librechat-data-provider';
import { isEnabled } from '~/utils/common';

export interface StripeServerConfig {
  enabled: true;
  allowCustomAmount: boolean;
  minUsd: number;
  maxUsd: number;
  creditsPerUsd: number;
  successUrl: string;
  cancelUrl: string;
  secretKey: string;
  webhookSecret?: string;
  currency: 'usd';
}

const DEFAULT_MIN_USD = 1;
const DEFAULT_MAX_USD = 100;
const DEFAULT_CREDITS_PER_USD = 1000000;

function parseNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getStripeServerConfig(appConfig?: AppConfig): StripeServerConfig | null {
  const appStripe = appConfig?.payments?.stripe as Partial<TStripePaymentsConfig> | undefined;

  const enabled = appStripe?.enabled ?? isEnabled(process.env.STRIPE_ENABLED);
  if (!enabled) {
    return null;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const successUrl = (appStripe?.successUrl ?? process.env.STRIPE_SUCCESS_URL)?.trim();
  const cancelUrl = (appStripe?.cancelUrl ?? process.env.STRIPE_CANCEL_URL)?.trim();

  if (!secretKey || !successUrl || !cancelUrl) {
    return null;
  }

  return {
    enabled: true,
    allowCustomAmount: appStripe?.allowCustomAmount ?? isEnabled(process.env.STRIPE_ALLOW_CUSTOM_AMOUNT),
    minUsd: appStripe?.minUsd ?? parseNumber(process.env.STRIPE_MIN_USD) ?? DEFAULT_MIN_USD,
    maxUsd: appStripe?.maxUsd ?? parseNumber(process.env.STRIPE_MAX_USD) ?? DEFAULT_MAX_USD,
    creditsPerUsd:
      appStripe?.creditsPerUsd ??
      parseNumber(process.env.STRIPE_CREDITS_PER_USD) ??
      DEFAULT_CREDITS_PER_USD,
    successUrl,
    cancelUrl,
    secretKey,
    webhookSecret,
    currency: 'usd',
  };
}

export function normalizeUsdAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function calculateCredits(amountUsd: number, creditsPerUsd: number): number {
  return Math.round(amountUsd * creditsPerUsd);
}