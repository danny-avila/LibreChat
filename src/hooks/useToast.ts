import { useRecoilState } from 'recoil';
import { useRef, useEffect } from 'react';
import type { TShowToast } from '~/common';
import { NotificationSeverity } from '~/common';
import store from '~/store';

export default function useToast(showDelay = 100) {
  const [toast, setToast] = useRecoilState(store.toastState);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
      }
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const showToast = ({
    message,
    severity = NotificationSeverity.SUCCESS,
    showIcon = true,
    duration = 3000, // default duration for the toast to be visible
    status,
  }: TShowToast) => {
    // Clear existing timeouts
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
    }
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
    }

    // Timeout to show the toast
    showTimerRef.current = window.setTimeout(() => {
      setToast({
        open: true,
        message,
        severity: (status as NotificationSeverity) ?? severity,
        showIcon,
      });
      // Hides the toast after the specified duration
      hideTimerRef.current = window.setTimeout(() => {
        setToast((prevToast) => ({ ...prevToast, open: false }));
      }, duration);
    }, showDelay);
  };

  return {
    toast,
    onOpenChange: (open: boolean) => setToast({ ...toast, open }),
    showToast,
  };
}
