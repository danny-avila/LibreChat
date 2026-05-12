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
  // Hold the latest callback identities in refs so the init effect can read
  // them without re-firing every render. react-query mutations (which back
  // refreshSubscription) return new object identity each render — putting them
  // in the deps array of the init effect creates an infinite re-init loop on
  // native after Purchases.configure() succeeds and triggers a state update.
  const refreshSubscriptionRef = useRef(refreshSubscription);
  const onMissingDependencyRef = useRef(onMissingDependency);
  refreshSubscriptionRef.current = refreshSubscription;
  onMissingDependencyRef.current = onMissingDependency;

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
          onMissingDependencyRef.current?.();
        }
        return;
      }

      const { Purchases, LOG_LEVEL } = purchasesModule;

      if (
        !listenerRegisteredRef.current &&
        typeof Purchases.addCustomerInfoUpdateListener === 'function'
      ) {
        listenerIdRef.current = await Purchases.addCustomerInfoUpdateListener(() => {
          void refreshSubscriptionRef.current();
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
        await refreshSubscriptionRef.current();
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
    // Intentional: callbacks are accessed via refs to avoid re-init on every
    // render. Effect re-fires only when enabled/userId/startupConfig change.
  }, [enabled, userId, startupConfig]);

  return {
    isNative: isNativePlatform(),
    nativePlatform: getNativePlatform(),
  };
}
