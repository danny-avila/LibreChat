import type { NotificationSeverity } from '~/common';
import type { TranslationKeys } from '~/hooks';

export type StripeReturnToast = {
  messageKey: TranslationKeys;
  status: NotificationSeverity;
};

export const STRIPE_RETURN_SESSION_KEY = 'post_checkout_stripe_status';

function getStripeReturnToast(stripeStatus: string): StripeReturnToast | null {
  if (stripeStatus === 'success') {
    return {
      messageKey: 'com_nav_balance_top_up_success',
      status: 'success' as NotificationSeverity,
    };
  }

  if (stripeStatus === 'cancel') {
    return {
      messageKey: 'com_nav_balance_top_up_cancel',
      status: 'info' as NotificationSeverity,
    };
  }

  return null;
}

export function persistStripeReturnToSession(redirectTarget?: string | null): void {
  if (!redirectTarget) {
    return;
  }

  const search = redirectTarget.includes('?') ? redirectTarget.slice(redirectTarget.indexOf('?')) : '';
  const stripeStatus = new URLSearchParams(search).get('stripe');
  if (!stripeStatus || getStripeReturnToast(stripeStatus) == null) {
    return;
  }

  sessionStorage.setItem(STRIPE_RETURN_SESSION_KEY, stripeStatus);
}

export function consumeStripeReturnParam(params: URLSearchParams): {
  nextParams: URLSearchParams;
  toast: StripeReturnToast | null;
} {
  const nextParams = new URLSearchParams(params);
  const stripeStatus = nextParams.get('stripe');

  if (stripeStatus != null) {
    nextParams.delete('stripe');
    sessionStorage.removeItem(STRIPE_RETURN_SESSION_KEY);
    return { nextParams, toast: getStripeReturnToast(stripeStatus) };
  }

  const storedStripeStatus = sessionStorage.getItem(STRIPE_RETURN_SESSION_KEY);
  if (storedStripeStatus != null) {
    sessionStorage.removeItem(STRIPE_RETURN_SESSION_KEY);
    return { nextParams, toast: getStripeReturnToast(storedStripeStatus) };
  }

  return { nextParams, toast: null };
}