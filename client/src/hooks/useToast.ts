import { useRef, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { NotificationSeverity } from '~/common';
import store from '~/store';

export default function useToast(timeoutDuration = 100) {
  const [toast, setToast] = useRecoilState(store.toastState);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  type TShowToast = {
    message: string;
    severity?: NotificationSeverity;
    showIcon?: boolean;
  };

  const showToast = ({
    message,
    severity = NotificationSeverity.SUCCESS,
    showIcon = true,
  }: TShowToast) => {
    setToast({ ...toast, open: false });
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setToast({ open: true, message, severity, showIcon });
    }, timeoutDuration);
  };

  return {
    toast,
    onOpenChange: (open: boolean) => setToast({ ...toast, open }),
    showToast,
  };
}
