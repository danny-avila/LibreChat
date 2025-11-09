#!/usr/bin/env node
/**
 * Get Authentication Token for LibreChat Testing
 * 
 * This helper logs in to LibreChat and retrieves a session token
 * that can be used for E2E testing.
 */

const axios = require('axios');
const readline = require('readline');

const LIBRECHAT_URL = process.env.LIBRECHAT_URL || 'http://localhost:3080';


async function getAuthToken(email, password) {
  try {
    // Login to LibreChat
    const response = await axios.post(
      `${LIBRECHAT_URL}/api/auth/login`,
      {
        email,
        password,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        withCredentials: true,
      }
    );

    // Extract token and refresh token from response
    const token = response.data.token;
    const refreshToken = response.data.refreshToken || response.data.refresh_token;
    const user = response.data.user;

    if (token) {
      console.log('\n✅ Successfully authenticated!');
      console.log(`User: ${user.name} (${user.email})`);
      console.log(`User ID: ${user.id}`);
      console.log(`\nToken: ${token}`);
      if (refreshToken) {
        console.log(`Refresh Token: ${refreshToken}`);
      }
      console.log(`\nAdd this to your environment:`);
      console.log(`export WOODLAND_TEST_TOKEN="${token}"`);
      console.log(`export TEST_USER_ID="${user.id}"`);
      if (refreshToken) {
        console.log(`export WOODLAND_REFRESH_TOKEN="${refreshToken}"`);
      }
      return { token, refreshToken, userId: user.id };
    } else {
      console.error('❌ No token received from login');
      return null;
    }
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.message || error.message);
    return null;
  }
}

/**
 * Refresh Authentication Token using refresh token
 */
async function refreshAuthToken(refreshToken) {
  try {
    const response = await axios.post(
      `${LIBRECHAT_URL}/api/auth/refresh`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${refreshToken}`,
          'Content-Type': 'application/json',
        },
        withCredentials: true,
      }
    );
    const token = response.data.token;
    if (token) {
      console.log('\n✅ Token refreshed!');
      console.log(`New Token: ${token}`);
      console.log(`export WOODLAND_TEST_TOKEN="${token}"`);
      return token;
    } else {
      console.error('❌ No token received from refresh');
      return null;
    }
  } catch (error) {
    console.error('❌ Token refresh failed:', error.response?.data?.message || error.message);
    return null;
  }
}

async function promptForCredentials() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Email: ', (email) => {
      rl.question('Password: ', (password) => {
        rl.close();
        resolve({ email, password });
      });
    });
  });
}

async function main() {
  console.log('🔐 LibreChat Authentication Helper');
  console.log(`Connecting to: ${LIBRECHAT_URL}\n`);

  // Check for credentials in command line args
  const email = process.argv[2];
  const password = process.argv[3];

  let credentials;
  if (email && password) {
    credentials = { email, password };
  } else {
    console.log('Enter your LibreChat credentials:\n');
    credentials = await promptForCredentials();
  }

  await getAuthToken(credentials.email, credentials.password);
}


if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getAuthToken, refreshAuthToken, promptForCredentials };
