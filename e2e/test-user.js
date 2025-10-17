/**
 * E2E Test User Configuration
 * Reads credentials from .env.e2e file
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.e2e') });

const DEMO_USER = {
  email: process.env.E2E_USER_EMAIL || 'sales-demo@senticor.de',
  password: process.env.E2E_USER_PASSWORD || '',
  name: 'Sales Demo',
};

if (!DEMO_USER.password) {
  console.warn('⚠️  E2E_USER_PASSWORD not set in .env.e2e file');
  console.warn('   Tests may fail. Please copy .env.e2e.example to .env.e2e and set the password');
}

module.exports = { DEMO_USER };
