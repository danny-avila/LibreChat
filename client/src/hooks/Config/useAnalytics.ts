import { useEffect } from 'react';
import { useAtom } from 'jotai';
import TagManager from 'react-gtm-module';
import { analyticsConsentAtom, hasAnalyticsGtmId } from '~/store/analytics';

/**
 * Tells an already loaded Google Tag Manager that analytics consent was withdrawn,
 * through the consent mode command `gtag('consent', 'update', ...)`. A loaded
 * container cannot be unloaded, so tags that ignore consent mode keep running
 * until the page reloads; the reload is what completes the revocation.
 */
function pushConsentDenied() {
  const dataLayer = window.dataLayer;
  if (!Array.isArray(dataLayer)) {
    return;
  }
  /** GTM reads consent commands only in the `arguments` shape gtag pushes, not as a plain array. */
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params -- GTM requires the Arguments object itself
    dataLayer?.push(arguments);
  }
  gtag('consent', 'update', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

/**
 * The only place Google Tag Manager is initialized. It loads when the
 * deployment set `ANALYTICS_GTM_ID` and the viewer granted consent, never before.
 * Mount it once per page shell (the signed-in layout and the shared-link view).
 */
export default function useAnalytics(gtmId: string | null | undefined) {
  const [consent, setConsent] = useAtom(analyticsConsentAtom);
  const enabled = hasAnalyticsGtmId(gtmId);

  useEffect(() => {
    if (!enabled || consent !== 'granted') {
      return;
    }
    if (typeof window.google_tag_manager !== 'undefined') {
      return;
    }
    TagManager.initialize({ gtmId });
  }, [enabled, gtmId, consent]);

  useEffect(() => {
    if (consent === 'denied') {
      pushConsentDenied();
    }
  }, [consent]);

  return { enabled, consent, setConsent };
}
