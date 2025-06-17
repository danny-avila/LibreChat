import { FullConfig } from '@playwright/test';
import authenticate from './authenticate';

async function globalSetup(config: FullConfig) {
  const user = {
    name: 'test',
    email: process.env.E2E_USER_EMAIL || 'playwright-test@librechat.local',
    password: process.env.E2E_USER_PASSWORD || 'PlaywrightTest123!',
  };

  await authenticate(config, user);
}

export default globalSetup;
