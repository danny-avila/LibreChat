const ReactGA = require('react-ga');

const trackingId = process.env.GOOGLE_ANALYTICS_TRACKING_ID;
const debug = process.env.NODE_ENV !== 'production';
const gaOptions = {
  anonymizeIp: true
};

ReactGA.initialize(trackingId, {
  debug,
  gaOptions
});

export const trackEvent = (category, action, label) => {
  ReactGA.event({
    category,
    action,
    label
  });
};
