declare global {
  interface Window {
    dataLayer: Array<object>;
  }
}

/**
 * Logs an event with Google Tag Manager (GTM).
 *
 * !! IMPORTANT: Each event must be configured in GTM in order to work; simply calling this function
 * does not mean a new event will start showing up in our analytics!
 *
 * For detailed instructions on setting up your new event, see this page:
 * https://newjersey.github.io/innovation-engineering/guides/monitoring/setting-up-google-analytics/
 */
export function logEvent(eventName: string, extraParameters: object = {}) {
  if (window.dataLayer) {
    window.dataLayer.push({ event: eventName, ...extraParameters });
  } else {
    console.log('In production, the following event would be logged to Google Analytics:', {
      eventName,
      extraParameters,
    });
  }
}
