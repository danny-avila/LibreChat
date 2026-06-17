import { logger } from '@librechat/data-schemas';
import {
  EModelEndpoint,
  removeNullishValues,
  normalizeEndpointName,
} from 'librechat-data-provider';
import type {
  TCustomConfig,
  TEndpoint,
  TPaymentsConfig,
  TTransactionsConfig,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { isEnabled } from '~/utils/common';

/**
 * Retrieves the balance configuration object
 * */
export function getBalanceConfig(appConfig?: AppConfig): Partial<TCustomConfig['balance']> | null {
  const isLegacyEnabled = isEnabled(process.env.CHECK_BALANCE);
  const startBalance = process.env.START_BALANCE;
  /** @type {} */
  const config: Partial<TCustomConfig['balance']> = removeNullishValues({
    enabled: isLegacyEnabled,
    startBalance: startBalance != null && startBalance ? parseInt(startBalance, 10) : undefined,
  });
  if (!appConfig) {
    return config;
  }
  return { ...config, ...(appConfig?.['balance'] ?? {}) };
}

/**
 * Retrieves the transactions configuration object
 * */
export function getTransactionsConfig(appConfig?: AppConfig): Partial<TTransactionsConfig> {
  const defaultConfig: TTransactionsConfig = { enabled: true };

  if (!appConfig) {
    return defaultConfig;
  }

  const transactionsConfig = appConfig?.['transactions'] ?? defaultConfig;
  const balanceConfig = getBalanceConfig(appConfig);

  // If balance is enabled but transactions are disabled, force transactions to be enabled
  // and log a warning
  if (balanceConfig?.enabled && !transactionsConfig.enabled) {
    logger.warn(
      'Configuration warning: transactions.enabled=false is incompatible with balance.enabled=true. ' +
        'Transactions will be enabled to ensure balance tracking works correctly.',
    );
    return { ...transactionsConfig, enabled: true };
  }

  return transactionsConfig;
}

/**
 * Retrieves the sanitized payments configuration object.
 * Secrets stay in environment variables and are never exposed to the client.
 */
export function getPaymentsConfig(appConfig?: AppConfig): Partial<TPaymentsConfig> | null {
  const stripeEnabled = isEnabled(process.env.STRIPE_ENABLED);
  const minUsd = process.env.STRIPE_MIN_USD;
  const maxUsd = process.env.STRIPE_MAX_USD;
  const creditsPerUsd = process.env.STRIPE_CREDITS_PER_USD;
  const allowCustomAmount = process.env.STRIPE_ALLOW_CUSTOM_AMOUNT;

  const config: Partial<TPaymentsConfig> = removeNullishValues({
    stripe: stripeEnabled
      ? removeNullishValues({
          enabled: true,
          allowCustomAmount:
            allowCustomAmount == null ? undefined : isEnabled(process.env.STRIPE_ALLOW_CUSTOM_AMOUNT),
          minUsd: minUsd != null && minUsd ? parseFloat(minUsd) : undefined,
          maxUsd: maxUsd != null && maxUsd ? parseFloat(maxUsd) : undefined,
          creditsPerUsd:
            creditsPerUsd != null && creditsPerUsd ? parseFloat(creditsPerUsd) : undefined,
        })
      : undefined,
  });

  if (!appConfig) {
    return Object.keys(config).length > 0 ? config : null;
  }

  const appStripe = appConfig.payments?.stripe;
  const stripe = removeNullishValues({
    enabled: appStripe?.enabled ?? config.stripe?.enabled,
    allowCustomAmount: appStripe?.allowCustomAmount ?? config.stripe?.allowCustomAmount,
    minUsd: appStripe?.minUsd ?? config.stripe?.minUsd,
    maxUsd: appStripe?.maxUsd ?? config.stripe?.maxUsd,
    creditsPerUsd: appStripe?.creditsPerUsd ?? config.stripe?.creditsPerUsd,
  });

  if (Object.keys(stripe).length === 0) {
    return null;
  }

  return { stripe };
}

export const getCustomEndpointConfig = ({
  endpoint,
  appConfig,
}: {
  endpoint: string | EModelEndpoint;
  appConfig?: AppConfig;
}): Partial<TEndpoint> | undefined => {
  if (!appConfig) {
    throw new Error(`Config not found for the ${endpoint} custom endpoint.`);
  }

  const customEndpoints = appConfig.endpoints?.[EModelEndpoint.custom] ?? [];
  return customEndpoints.find(
    (endpointConfig) =>
      normalizeEndpointName(endpointConfig.name) === normalizeEndpointName(endpoint),
  );
};
