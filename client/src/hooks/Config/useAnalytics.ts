import { useEffect } from 'react';
import { useAtom } from 'jotai';
import TagManager from 'react-gtm-module';
import { analyticsConsentAtom, hasAnalyticsGtmId } from '~/store/analytics';

type ConsentState = 'granted' | 'denied';

/**
 * Tells an already loaded Google Tag Manager the viewer's current answer, through
 * the consent mode command `gtag('consent', 'update', ...)`. A loaded container
 * cannot be unloaded, so after a withdrawal tags that ignore consent mode keep
 * running until the page reloads; the reload is what completes the revocation.
 */
function pushConsentUpdate(state: ConsentState) {
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
    analytics_storage: state,
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
  });
}

/** Whether a container is already on this page: GTM itself, or the `gtm.js` start
 *  event its snippet queues before the script arrives. */
function isContainerLoaded() {
  if (typeof window.google_tag_manager !== 'undefined') {
    return true;
  }
  return (window.dataLayer ?? []).some(
    (entry) => (entry as { event?: unknown } | null)?.event === 'gtm.js',
  );
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
    if (isContainerLoaded()) {
      /** Consent given again after a withdrawal in this page: the container is
       *  still here, so it only needs the new answer. */
      pushConsentUpdate('granted');
      return;
    }
    TagManager.initialize({ gtmId });
  }, [enabled, gtmId, consent]);

  useEffect(() => {
    if (consent === 'denied') {
      pushConsentUpdate('denied');
    }
  }, [consent]);

  return { enabled, consent, setConsent };
}
