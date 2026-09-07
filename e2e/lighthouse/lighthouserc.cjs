module.exports = {
  ci: {
    collect: {
      url: [process.env.LIGHTHOUSE_URL],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        throttlingMethod: 'provided',
        onlyCategories: ['performance'],
        extraHeaders: { Cookie: process.env.LIGHTHOUSE_COOKIE },
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': [
          'error',
          { maxNumericValue: 4500, aggregationMethod: 'median' },
        ],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        'total-blocking-time': ['error', { maxNumericValue: 500, aggregationMethod: 'median' }],
      },
    },
  },
};
