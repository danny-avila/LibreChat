import { FullConfig } from '@playwright/test';
import authenticate from './authenticate';
import localUser from '../config.local';

async function globalSetup(config: FullConfig) {
  await authenticate(config, localUser);
}

export default globalSetup;
