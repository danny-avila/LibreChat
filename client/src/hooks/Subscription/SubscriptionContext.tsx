import {
  createContext,
  useMemo,
  useState,
  useEffect,
  useContext,
  useCallback,
  type ReactNode,
} from 'react';
import posthog from 'posthog-js';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import {
  useGetStartupConfig,
  useGetSubscriptionQuery,
  useRefreshSubscriptionMutation,
  useSubscriptionCheckoutLinkMutation,
} from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import type {
  TSubscriptionCheckoutResponse,
  TSubscriptionResponse,
} from '~/data-provider/Subscription/types';
import useRevenueCatInit from './useRevenueCatInit';
import {
  getRevenueCatPublicSdkKey,
  isNativePlatform,
  loadPurchasesModule,
  loadPurchasesUiModule,
} from './revenuecat';

type TSubscriptionContext = {
  subscription: TSubscriptionResponse | null;
  isLoading: boolean;
  isNative: boolean;
  isPro: boolean;
  currentPlan: string | null;
  freeMessagesRemaining: number | null;
  managementUrl: string | null;
  refreshSubscription: () => Promise<TSubscriptionResponse | null>;
  openUpgradeFlow: () => Promise<void>;
  openManageFlow: () => Promise<void>;
  restorePurchases: () => Promise<void>;
};

const SubscriptionContext = createContext<TSubscriptionContext | undefined>(undefined);

const getSubscriptionConfig = (startupConfig?: Record<string, any> | null) =>
  startupConfig?.subscription as
    | {
        enabled?: boolean;
        entitlementId?: string;
      }
    | undefined;

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { isAuthenticated, user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig({
    enabled: isAuthenticated,
  });
  const subscriptionConfig = getSubscriptionConfig(startupConfig as Record<string, any> | null);
  const subscriptionEnabled = subscriptionConfig?.enabled !== false;
  const entitlementId = subscriptionConfig?.entitlementId ?? 'codecan_ai_pro';

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    console.debug('[Subscription] startup config', startupConfig?.subscription ?? null);
  }, [startupConfig]);

  const [hasShownDependencyWarning, setHasShownDependencyWarning] = useState(false);
  const handleMissingDependency = useCallback(() => {
    if (hasShownDependencyWarning) {
      return;
    }
    setHasShownDependencyWarning(true);
    showToast({
      status: 'warning',
      message:
        'RevenueCat native SDK packages are not installed yet. Install @revenuecat/purchases-capacitor and @revenuecat/purchases-capacitor-ui to enable native upgrades.',
    });
  }, [hasShownDependencyWarning, showToast]);

  const subscriptionQuery = useGetSubscriptionQuery({
    enabled: isAuthenticated && subscriptionEnabled,
  });

  const refreshMutation = useRefreshSubscriptionMutation({
    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.subscription], data);
    },
  });

  const checkoutMutation = useSubscriptionCheckoutLinkMutation();

  const refreshSubscription = useCallback(async () => {
    if (!isAuthenticated || !subscriptionEnabled) {
      return null;
    }

    try {
      const data = await refreshMutation.mutateAsync(undefined);
      return data;
    } catch (error) {
      console.warn('[Subscription] refresh failed', error);
      const cachedSubscription = queryClient.getQueryData<TSubscriptionResponse | null>([
        QueryKeys.subscription,
      ]);
      return cachedSubscription ?? null;
    }
  }, [isAuthenticated, queryClient, refreshMutation, subscriptionEnabled]);

  useRevenueCatInit({
    enabled: isAuthenticated && subscriptionEnabled,
    startupConfig: startupConfig as Record<string, any> | null,
    userId: user?.id,
    refreshSubscription,
    onMissingDependency: handleMissingDependency,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      queryClient.removeQueries([QueryKeys.subscription]);
    }
  }, [isAuthenticated, queryClient]);

  const subscription = useMemo(() => subscriptionQuery.data ?? null, [subscriptionQuery.data]);
  const isNative = isNativePlatform();
  const isPro = subscription?.isPro === true;
  const currentPlan = subscription?.currentPlan ?? null;
  const freeMessagesRemaining = subscription?.freeMessagesRemaining ?? null;
  const managementUrl = subscription?.managementUrl ?? null;

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    if (subscriptionQuery.error) {
      console.warn('[Subscription] query error', subscriptionQuery.error);
      return;
    }
    if (subscriptionQuery.data) {
      console.debug('[Subscription] query success', subscriptionQuery.data);
    }
  }, [subscriptionQuery.data, subscriptionQuery.error]);

  const openUpgradeFlow = useCallback(async () => {
    if (!subscriptionEnabled) {
      return;
    }

    posthog.capture('subscription_upgrade_clicked', {
      platform: isNative ? 'native' : 'web',
      is_pro: subscriptionQuery.data?.isPro,
      current_plan: subscriptionQuery.data?.currentPlan,
    });

    if (isNative) {
      const apiKey = getRevenueCatPublicSdkKey(startupConfig as Record<string, any> | null);
      if (!apiKey) {
        showToast({
          status: 'error',
          message: 'RevenueCat native SDK key is not configured.',
        });
        return;
      }

      const purchasesUiModule = await loadPurchasesUiModule();
      if (!purchasesUiModule?.RevenueCatUI) {
        showToast({
          status: 'error',
          message:
            'RevenueCat native SDK packages are missing. Install the RevenueCat Capacitor SDK to enable in-app purchases.',
        });
        return;
      }

      posthog.capture('paywall_viewed', {
        platform: 'native',
        entitlement_id: entitlementId,
        is_pro: subscriptionQuery.data?.isPro,
        current_plan: subscriptionQuery.data?.currentPlan,
      });

      try {
        await purchasesUiModule.RevenueCatUI.presentPaywallIfNeeded({
          requiredEntitlementIdentifier: entitlementId,
        });
        await refreshSubscription();
      } catch (error) {
        console.warn('[Subscription] native paywall failed', error);
        showToast({
          status: 'error',
          message: 'Unable to open the subscription paywall right now.',
        });
      }
      return;
    }

    try {
      const response = (await checkoutMutation.mutateAsync(
        undefined,
      )) as TSubscriptionCheckoutResponse;
      if (response?.url) {
        posthog.capture('paywall_viewed', {
          platform: 'web',
          entitlement_id: entitlementId,
          is_pro: subscriptionQuery.data?.isPro,
          current_plan: subscriptionQuery.data?.currentPlan,
        });
        window.location.assign(response.url);
        return;
      }
    } catch (error) {
      console.warn('[Subscription] web checkout failed', error);
    }

    showToast({
      status: 'error',
      message: 'Unable to start web checkout right now.',
    });
  }, [
    checkoutMutation,
    entitlementId,
    isNative,
    refreshSubscription,
    showToast,
    startupConfig,
    subscriptionEnabled,
  ]);

  const openManageFlow = useCallback(async () => {
    if (isNative) {
      const purchasesUiModule = await loadPurchasesUiModule();
      if (!purchasesUiModule?.RevenueCatUI) {
        showToast({
          status: 'error',
          message: 'RevenueCat native SDK packages are missing.',
        });
        return;
      }

      try {
        await purchasesUiModule.RevenueCatUI.presentCustomerCenter();
        await refreshSubscription();
      } catch (error) {
        console.warn('[Subscription] customer center failed', error);
        showToast({
          status: 'error',
          message: 'Unable to open subscription management right now.',
        });
      }
      return;
    }

    if (managementUrl) {
      window.open(managementUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    showToast({
      status: 'warning',
      message: 'No subscription management link is available for this account yet.',
    });
  }, [isNative, managementUrl, refreshSubscription, showToast]);

  const restorePurchases = useCallback(async () => {
    if (!isNative) {
      return;
    }

    const purchasesModule = await loadPurchasesModule();
    if (!purchasesModule?.Purchases) {
      showToast({
        status: 'error',
        message: 'RevenueCat native SDK packages are missing.',
      });
      return;
    }

    try {
      await purchasesModule.Purchases.restorePurchases();
      await refreshSubscription();
      showToast({
        status: 'success',
        message: 'Purchases restored.',
      });
    } catch (error) {
      console.warn('[Subscription] restore failed', error);
      showToast({
        status: 'error',
        message: 'Unable to restore purchases right now.',
      });
    }
  }, [isNative, refreshSubscription, showToast]);

  const value = useMemo<TSubscriptionContext>(
    () => ({
      subscription,
      isLoading:
        subscriptionQuery.isLoading || refreshMutation.isLoading || checkoutMutation.isLoading,
      isNative,
      isPro,
      currentPlan,
      freeMessagesRemaining,
      managementUrl,
      refreshSubscription,
      openUpgradeFlow,
      openManageFlow,
      restorePurchases,
    }),
    [
      checkoutMutation.isLoading,
      currentPlan,
      freeMessagesRemaining,
      isNative,
      isPro,
      managementUrl,
      openManageFlow,
      openUpgradeFlow,
      refreshMutation.isLoading,
      refreshSubscription,
      restorePurchases,
      subscription,
      subscriptionQuery.isLoading,
    ],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const useOptionalSubscription = () => useContext(SubscriptionContext);
