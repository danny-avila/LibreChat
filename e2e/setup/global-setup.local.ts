import { FullConfig } from '@playwright/test';
import localUser from '../config.local';
import authenticate from './authenticate';

async function globalSetup(config: FullConfig) {
  await authenticate(config, localUser);
}

export default globalSetup;
