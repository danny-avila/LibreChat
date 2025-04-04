import { initModelData } from './modelBadges';

/**
 * Initialize forked custom features
 * - Loads model data on app startup to avoid delays on first model selection
 */
export const initialize = () => {
  // Pre-fetch model data in the background
  initModelData().catch(err => {
    console.error('Failed to initialize model data:', err);
  });
};

export default {
  initialize,
};