import ReactGA from 'react-ga';

const trackingId = process.env.GOOGLE_ANALYTICS_TRACKING_ID;
const debug = process.env.NODE_ENV !== 'production';
const gaOptions = {
  anonymizeIp: true
};

if (trackingId) {
  ReactGA.initialize(trackingId, {
    debug,
    gaOptions
  });
}

export const trackEvent = (category, action, label) => {
  if (trackingId) {
    ReactGA.event({
      category,
      action,
      label
    });
  }
};
