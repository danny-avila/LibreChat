import type { NotificationSeverity } from '~/common';
import type { TranslationKeys } from '~/hooks';

export type StripeReturnToast = {
  messageKey: TranslationKeys;
  status: NotificationSeverity;
};

export function consumeStripeReturnParam(params: URLSearchParams): {
  nextParams: URLSearchParams;
  toast: StripeReturnToast | null;
} {
  const nextParams = new URLSearchParams(params);
  const stripeStatus = nextParams.get('stripe');

  if (stripeStatus == null) {
    return { nextParams, toast: null };
  }

  nextParams.delete('stripe');

  if (stripeStatus === 'success') {
    return {
      nextParams,
      toast: {
        messageKey: 'com_nav_balance_top_up_success',
        status: 'success' as NotificationSeverity,
      },
    };
  }

  if (stripeStatus === 'cancel') {
    return {
      nextParams,
      toast: {
        messageKey: 'com_nav_balance_top_up_cancel',
        status: 'info' as NotificationSeverity,
      },
    };
  }

  return { nextParams, toast: null };
}