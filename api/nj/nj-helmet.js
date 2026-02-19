const { contentSecurityPolicy } = require('helmet');

/**
 * CSP that allows for:
 *
 * - Google Tag Manager
 * - Feedback widget
 */
function njContentSecurityPolicy() {
  return contentSecurityPolicy({
    directives: {
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // LibreChat has inline scripts
        'https://*.googletagmanager.com',
        'https://*.nj.gov',
      ],
      imgSrc: [
        "'self'",
        'https://*.google-analytics.com',
        'https://*.googletagmanager.com',
        'https://*.g.doubleclick.net',
        'https://*.google.com',
        'https://*.nj.gov',
        'blob:',
        'data:',
      ],
      connectSrc: [
        "'self'",
        'https://*.google-analytics.com',
        'https://*.analytics.google.com',
        'https://*.googletagmanager.com',
        'https://*.google.com',
        'https://*.g.doubleclick.net',
        'https://pagead2.googlesyndication.com',
        'https://*.nj.gov',
      ],
      frameSrc: ["'self'", 'https://www.googletagmanager.com'],
    },
  });
}

module.exports = { njContentSecurityPolicy };
