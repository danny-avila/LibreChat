// Central config, everything comes from the environment (deploy/env/billing.env).
const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
};

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  publicUrl: (process.env.PUBLIC_URL || 'https://librechat.aidstlab.top').replace(/\/$/, ''),
  basePath: '/billing',
  mongoUri: process.env.MONGO_URI || 'mongodb://mongodb:27017/LibreChat',
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  alfapay: {
    // 'alfa' — real AlfaPay gateway; 'mock' — built-in fake payment page for testing.
    driver: process.env.ALFAPAY_DRIVER || 'mock',
    baseUrl: (process.env.ALFAPAY_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.ALFAPAY_API_KEY || '',
    projectId: process.env.ALFAPAY_PROJECT_ID || '',
  },
  // How often pending orders are re-checked against the gateway (webhook backup).
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '60000', 10),
  // Orders older than this stop being polled and are marked expired.
  orderTtlHours: parseInt(process.env.ORDER_TTL_HOURS || '24', 10),
};
