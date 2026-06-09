import type { User } from '../types';
import exampleLocalUser from '../config.local.example';

const loadLocalConfig = (): User => {
  try {
    // Runtime-only override for local e2e runs; config.local.ts is intentionally gitignored.
    const localModule = require('../config.local') as { default?: User };
    return localModule.default ?? exampleLocalUser;
  } catch {
    return exampleLocalUser;
  }
};

export default loadLocalConfig();
