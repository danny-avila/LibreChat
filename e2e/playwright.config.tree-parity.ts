import { defineConfig } from '@playwright/test';
import treePerfConfig from './playwright.config.tree-perf';

/**
 * Runs the branch-sensitive mock specs against the vite dev server with the
 * flat thread renderer defaulted ON, so the prototype is checked against the
 * same scenarios the recursive renderer passes.
 */
process.env.VITE_FLAT_THREAD = process.env.VITE_FLAT_THREAD ?? 'true';

export default defineConfig({
  ...treePerfConfig,
  testDir: 'specs/mock',
  testMatch: /(message-tree|thread-fold|chat|hover-actions)\.spec\.ts$/,
  outputDir: 'specs/.test-results',
});
