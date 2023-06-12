import {FullConfig} from '@playwright/test';
import authenticate from './authenticate';

async function globalSetup(config: FullConfig) {
  const user = {
    username: String(process.env.E2E_USER_EMAIL),
    password: String(process.env.E2E_USER_PASSWORD),
  };

  await authenticate(config, user);
}

export default globalSetup;
