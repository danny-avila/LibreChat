import { defineConfig } from '@playwright/test';
import mockConfig from './playwright.config.mock';

/** Browser scenarios whose behavior crosses the generation stream-store boundary. */
export default defineConfig({
  ...mockConfig,
  testMatch: [
    /completion\.spec\.ts/,
    /deferred-tools-hitl\.spec\.ts/,
    /model-spec-icons\.spec\.ts/,
    /steering\.spec\.ts/,
    /steering-escalation\.spec\.ts/,
    /streaming\.spec\.ts/,
    /thread-fold\.spec\.ts/,
    /tool-approvals\.spec\.ts/,
    /usage\.spec\.ts/,
  ],
});
