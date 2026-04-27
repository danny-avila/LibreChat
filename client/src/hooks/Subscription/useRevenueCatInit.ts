import { useEffect, useRef } from 'react';
import {
  getNativePlatform,
  getRevenueCatPublicSdkKey,
  isNativePlatform,
  loadPurchasesModule,
} from './revenuecat';

type TUseRevenueCatInitParams = {
  enabled: boolean;
  startupConfig?: Record<string, any> | null;
  userId?: string | null;
  refreshSubscription: () => Promise<unknown>;
  onMissingDependency?: () => void;
};

export default function useRevenueCatInit({
  enabled,
  startupConfig,
  userId,
  refreshSubscription,
  onMissingDependency,
}: TUseRevenueCatInitParams) {
  const initializedUserRef = useRef<string | null>(null);
  const listenerRegisteredRef = useRef(false);
  const listenerIdRef = useRef<string | null>(null);
  const missingDependencyWarnedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      if (!enabled || !userId || !isNativePlatform()) {
        return;
      }

      const apiKey = getRevenueCatPublicSdkKey(startupConfig);
      if (!apiKey) {
        return;
      }

      const purchasesModule = await loadPurchasesModule();
      if (!purchasesModule?.Purchases) {
        if (!missingDependencyWarnedRef.current) {
          missingDependencyWarnedRef.current = true;
          onMissingDependency?.();
        }
        return;
      }

      const { Purchases, LOG_LEVEL } = purchasesModule;

      if (
        !listenerRegisteredRef.current &&
        typeof Purchases.addCustomerInfoUpdateListener === 'function'
      ) {
        listenerIdRef.current = await Purchases.addCustomerInfoUpdateListener(() => {
          void refreshSubscription();
        });
        listenerRegisteredRef.current = true;
      }

      if (initializedUserRef.current == null) {
        if (typeof Purchases.setLogLevel === 'function' && LOG_LEVEL?.DEBUG != null) {
          await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        }
        await Purchases.configure({ apiKey, appUserID: userId });
        initializedUserRef.current = userId;
      } else if (initializedUserRef.current !== userId) {
        if (typeof Purchases.logIn === 'function') {
          await Purchases.logIn({ appUserID: userId });
        } else {
          await Purchases.configure({ apiKey, appUserID: userId });
        }
        initializedUserRef.current = userId;
      }

      if (!cancelled) {
        await refreshSubscription();
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      listenerRegisteredRef.current = false;
      if (!isNativePlatform()) {
        listenerIdRef.current = null;
        if (!enabled) {
          initializedUserRef.current = null;
        }
        return;
      }
      void (async () => {
        const purchasesModule = await loadPurchasesModule();
        const { Purchases } = purchasesModule ?? {};
        if (
          listenerIdRef.current != null &&
          typeof Purchases?.removeCustomerInfoUpdateListener === 'function'
        ) {
          await Purchases.removeCustomerInfoUpdateListener({
            listenerToRemove: listenerIdRef.current,
          });
        }
        listenerIdRef.current = null;
      })();
      if (!enabled) {
        initializedUserRef.current = null;
      }
    };
  }, [enabled, onMissingDependency, refreshSubscription, startupConfig, userId]);

  return {
    isNative: isNativePlatform(),
    nativePlatform: getNativePlatform(),
  };
}
