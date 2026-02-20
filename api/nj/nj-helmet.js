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
        "'unsafe-eval'", // For LibreChat image conversion
        'https://*.googletagmanager.com',
        'https://*.g.doubleclick.net',
        'https://*.nj.gov',
      ],
      imgSrc: [
        "'self'",
        'https://*.google-analytics.com',
        'https://*.googletagmanager.com',
        'https://*.g.doubleclick.net',
        'https://*.google.com',
        'https://*.nj.gov',
        'https://*.s3.us-east-1.amazonaws.com',
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
      workerSrc: ["'self'", 'blob:'],
    },
  });
}

module.exports = { njContentSecurityPolicy };
