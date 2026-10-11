import { useEffect } from 'react';
import { useAtom } from 'jotai';
import TagManager from 'react-gtm-module';
import { analyticsConsentAtom, hasAnalyticsGtmId } from '~/store/analytics';

type ConsentState = 'granted' | 'denied';

/**
 * Sends a Google consent mode command (`gtag('consent', ...)`) to the data layer.
 * The viewer answers one question, analytics, so advertising storage and ad data
 * use stay denied whatever the answer. A loaded container cannot be unloaded, so
 * after a withdrawal tags that ignore consent mode keep running until the page
 * reloads; the reload is what completes the revocation.
 */
function pushConsent(command: 'default' | 'update', analytics: ConsentState) {
  window.dataLayer = window.dataLayer ?? [];
  const dataLayer = window.dataLayer;
  /** GTM reads consent commands only in the `arguments` shape gtag pushes, not as a plain array. */
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params -- GTM requires the Arguments object itself
    dataLayer.push(arguments);
  }
  gtag('consent', command, {
    analytics_storage: analytics,
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

/** The `gtm.js` script of this deployment's container, while it loads or after. */
function findContainerScript(gtmId: string): HTMLScriptElement | undefined {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="gtm.js"]')).find(
    (script) => {
      try {
        return new URL(script.src, window.location.href).searchParams.get('id') === gtmId;
      } catch {
        return false;
      }
    },
  );
}

/** Whether this deployment's container is on the page, loading or loaded. GTM
 *  registers each container it runs under its id, so another container does not
 *  count. A script that failed to load is removed (see `initializeContainer`). */
function isContainerPresent(gtmId: string) {
  const registry = window.google_tag_manager as Record<string, unknown> | undefined;
  return registry?.[gtmId] != null || findContainerScript(gtmId) != null;
}

/** Loads the container with consent defaults queued ahead of its first tag. A
 *  script that fails to load is removed, so the next grant retries it. */
function initializeContainer(gtmId: string) {
  /** The snippet keeps an existing data layer, so the defaults stay first in it. */
  pushConsent('default', 'granted');
  TagManager.initialize({ gtmId });
  const script = findContainerScript(gtmId);
  script?.addEventListener('error', () => script.remove(), { once: true });
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
    if (isContainerPresent(gtmId)) {
      /** Consent given again after a withdrawal in this page, or a second shell
       *  mounting: the container is already here and only needs the answer. */
      pushConsent('update', 'granted');
      return;
    }
    initializeContainer(gtmId);
  }, [enabled, gtmId, consent]);

  useEffect(() => {
    /** Nothing is pushed unless this deployment's container is on the page; one
     *  still loading reads the update from the data layer queue when it starts. */
    if (enabled && consent === 'denied' && isContainerPresent(gtmId)) {
      pushConsent('update', 'denied');
    }
  }, [enabled, gtmId, consent]);

  return { enabled, consent, setConsent };
}
