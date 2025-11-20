import { useEffect, useRef } from 'react';

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: {
    request: (type: WakeLockType) => Promise<WakeLockSentinel>;
  };
};

const isClientEnvironment =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  typeof document !== 'undefined';

const getNavigator = () => navigator as WakeLockCapableNavigator;

export const useWakeLock = (shouldHold: boolean) => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const supportsWakeLock = isClientEnvironment && 'wakeLock' in navigator;

  useEffect(() => {
    if (!supportsWakeLock) {
      return;
    }

    let cancelled = false;
    const { wakeLock } = getNavigator();

    if (!wakeLock) {
      return;
    }

    const releaseLock = async () => {
      if (!wakeLockRef.current) {
        return;
      }

      try {
        await wakeLockRef.current.release();
      } catch (error) {
        console.warn('[WakeLock] release failed', error);
      } finally {
        wakeLockRef.current = null;
      }
    };

    const requestLock = async () => {
      if (
        !shouldHold ||
        cancelled ||
        document.visibilityState !== 'visible' ||
        wakeLockRef.current
      ) {
        return;
      }

      try {
        const sentinel = await wakeLock.request('screen');
        wakeLockRef.current = sentinel;

        const handleRelease = () => {
          wakeLockRef.current = null;
          sentinel.removeEventListener('release', handleRelease);
          if (!cancelled && shouldHold && document.visibilityState === 'visible') {
            void requestLock();
          }
        };

        sentinel.addEventListener('release', handleRelease);
      } catch (error) {
        console.warn('[WakeLock] request failed', error);
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) {
        return;
      }

      if (document.visibilityState === 'visible' && shouldHold) {
        void requestLock();
      }
    };

    if (shouldHold) {
      void requestLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      void releaseLock();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseLock();
    };
  }, [shouldHold, supportsWakeLock]);
};

export default useWakeLock;

