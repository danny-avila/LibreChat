/**
 * E2E test setup: loads real API keys from root .env
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Fall back to .env.test only for variables NOT set by .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });

// Ensure required infra vars are set for modules that import them
if (!process.env.MONGO_URI) {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dummy-uri';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test';
}
if (!process.env.CREDS_KEY) {
  process.env.CREDS_KEY = 'test';
}
if (!process.env.CREDS_IV) {
  process.env.CREDS_IV = 'test';
}

jest.setTimeout(180_000);
